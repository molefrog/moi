#!/usr/bin/env bun
import { defineCommand, runMain, showUsage } from 'citty'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'path'
import pc from 'picocolors'

import { COLOR_THEMES, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme } from '@/lib/themes'
import type { ScratchArrowEnd, ScratchOp } from '@/lib/types'

import { columns } from './cli-ui'
import { CONTROL_PORT, PORT } from './constants'
import { scaffoldMoiDir } from './moi-scaffold'
import { type OpenClawAgent, discoverOpenClawAgents } from './openclaw'
import { liftToWorkspaceRoot, registerWorkspace } from './registry'
import { installBundledSkills } from './skills-template'

// ---- helpers ----------------------------------------------------------------

async function isServerRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)
    const timer = setTimeout(() => {
      ws.close()
      resolve(false)
    }, 600)
    ws.onopen = () => {
      clearTimeout(timer)
      ws.close()
      resolve(true)
    }
    ws.onerror = () => {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

async function waitForServer(timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isServerRunning()) return true
    await Bun.sleep(200)
  }
  return false
}

async function registerViaControl(absPath: string): Promise<string> {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'workspace:register', path: absPath }))
    ws.onmessage = event => {
      const data = JSON.parse(String(event.data))
      if (data.id) {
        ws.close()
        res(data.id)
      }
    }
    ws.onerror = () => rej(new Error('Could not connect to control server'))
  })
}

async function openBrowser(url: string) {
  try {
    if (process.platform === 'darwin') await Bun.$`open ${url}`.quiet()
    else if (process.platform === 'linux') await Bun.$`xdg-open ${url}`.quiet()
  } catch {}
}

// Spawn the server as a child with cwd=projectRoot so bunfig.toml is found at Bun startup.
// bunfig.toml is read before any JS runs, so process.chdir() is too late.
// MOI_SERVER=1 tells the child it is the actual server process. No `--hot`:
// frontend HMR comes from Bun.serve's dev bundler, and server reloads are a
// full process restart driven by the dev supervisor (see runDevSupervisor).
function spawnServer(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env
): ReturnType<typeof Bun.spawn> {
  return Bun.spawn(['bun', import.meta.filename, 'start'], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    cwd: projectRoot,
    env: { ...env, MOI_SERVER: '1' }
  })
}

// Dev supervisor: run the server as a child WITHOUT `bun --hot`, watch the
// server-side source (`server/`, `lib/`) and full-restart the child on change.
// Client files are intentionally not watched here — Bun.serve owns frontend HMR
// and patches the browser in place. The child shuts down gracefully on SIGTERM
// (closing servers + killing function workers), so restarts leak nothing.
async function runDevSupervisor(
  projectRoot: string,
  env: Record<string, string | undefined>
): Promise<void> {
  const { watch } = await import('node:fs')

  let child = spawnServer(projectRoot, env)
  let restarting = false
  let debounce: ReturnType<typeof setTimeout> | undefined

  async function restart(reason: string) {
    if (restarting) return
    restarting = true
    console.log(pc.dim(`\n↻ ${reason} — restarting server…`))
    try {
      child.kill('SIGTERM')
    } catch {}
    const sigkill = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
    }, 3000)
    await child.exited
    clearTimeout(sigkill)
    restarting = false
    child = spawnServer(projectRoot, env)
  }

  for (const dir of ['server', 'lib']) {
    watch(join(projectRoot, dir), { recursive: true }, (_event, file) => {
      if (!file || !file.endsWith('.ts')) return
      clearTimeout(debounce)
      debounce = setTimeout(() => restart(`${file} changed`), 100)
    })
  }

  // Forward termination to the child, then exit the supervisor.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      try {
        child.kill('SIGTERM')
      } catch {}
      process.exit(0)
    })
  }

  // Keep the supervisor alive indefinitely.
  await new Promise<void>(() => {})
}

// ---- commands ---------------------------------------------------------------

const init = defineCommand({
  meta: {
    name: 'init',
    description: 'Initialize workspace, copy skills and scaffold folder with widgets'
  },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Target directory (default: current)'
    },
    web: {
      type: 'boolean',
      default: false,
      description: 'Start the web server if not already running'
    }
  },
  async run({ args }) {
    const requested = resolve(args.dir)
    // Locate the workspace root first: if invoked from inside a `.moi/` (or a
    // deeper accidental `.moi/.moi/…`), lift to the directory that owns it
    // instead of scaffolding a nested workspace. This is what stops the
    // `.moi/.moi` bug at the source.
    const target = liftToWorkspaceRoot(requested)
    if (target !== requested) {
      console.log(
        '\n' +
          pc.yellow('◆') +
          ' Ran inside ' +
          pc.bold('.moi') +
          ' — using the workspace root ' +
          pc.bold(target) +
          ' instead (no nested .moi created).'
      )
    }
    // Flag a stray nested `.moi/.moi` left by the old cwd bug — harmless but
    // confusing, and easy to remove.
    const stray = join(target, '.moi', '.moi')
    if (existsSync(stray)) {
      console.log(
        '\n' +
          pc.yellow('⚠') +
          ' Found a stray nested ' +
          pc.bold('.moi/.moi') +
          ' (from an older bug). Safe to remove:\n' +
          pc.dim('  rm -rf ' + stray)
      )
    }

    const projectRoot = join(import.meta.dir, '..')
    const isInteractive = process.stdout.isTTY

    await mkdir(target, { recursive: true })
    await installBundledSkills(join(target, '.claude', 'skills'))

    // Bootstrap the `.moi/` root (widgets dir + package.json + bun install)
    // for a fresh workspace; an existing `.moi/` is left untouched.
    console.log()
    const scaffold = await scaffoldMoiDir(target)
    if (scaffold !== 'exists') {
      console.log(pc.dim('  Installed widget dependencies in .moi/'))
      if (scaffold !== 0) {
        console.warn(pc.yellow('  bun install failed — run it manually in .moi/'))
      }
    }

    // Always register the workspace in the persistent registry
    const entry = await registerWorkspace(target)

    console.log(pc.green('✓') + ' Initialized ' + pc.bold(target))
    console.log('  Skills installed — ask Claude to build a widget to get started\n')

    // If --web and server not running, start it (stay alive as wrapper)
    let running = await isServerRunning()

    if (!running && args.web) {
      console.log(pc.dim('  Starting server…'))
      const proc = spawnServer(projectRoot)
      running = await waitForServer()
      if (!running) {
        console.error(pc.red('  Server failed to start\n'))
        await proc.exited
        process.exit(1)
      }
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      console.log(pc.green('✓') + ' Server started on http://localhost:' + PORT)
      if (isInteractive) console.log('  Opening ' + pc.bold(url))
      console.log(pc.dim('  Press Ctrl+C to stop\n'))
      if (isInteractive) await openBrowser(url)
      await proc.exited
      process.exit(proc.exitCode ?? 0)
    }

    if (running) {
      // Server already running — notify it and open (browser only in interactive mode)
      await registerViaControl(target)
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      if (isInteractive) {
        console.log('  Opening ' + pc.bold(url) + '\n')
        await openBrowser(url)
      } else {
        console.log('  Ready at ' + pc.bold(url) + '\n')
      }
      process.exit(0)
    }

    // Server not running and --web not passed
    console.log('  Run ' + pc.bold('moi start') + ' to open in the browser\n')
  }
})

const start = defineCommand({
  meta: { name: 'start', description: 'Start the moi web server' },
  args: {
    port: {
      type: 'string',
      description: 'HTTP port to listen on (default: 3000)'
    }
  },
  async run({ args }) {
    const projectRoot = join(import.meta.dir, '..')
    // Undocumented: --dev runs the watch-and-full-restart dev supervisor.
    const dev = process.argv.includes('--dev')

    // Launcher path: we are the CLI, not the server. Decide whether to bail
    // (a server is already up), run the dev supervisor, or spawn a one-shot
    // server. Skipped when MOI_SERVER=1 (we are the spawned server itself).
    if (!process.env.MOI_SERVER) {
      if (await isServerRunning()) {
        console.log(
          '\n' + pc.yellow('◆') + ' Server is already running on http://localhost:' + PORT + '\n'
        )
        process.exit(0)
      }

      // Spawn server with correct cwd so bunfig.toml is picked up at Bun startup.
      // MOI_DEV tells the server to use the live bundler + HMR even if a stale
      // `dist/` exists in the tree (prod serves prebuilt `dist/` statically).
      const env = {
        ...process.env,
        ...(args.port ? { PORT: args.port } : {}),
        ...(dev ? { MOI_DEV: '1' } : {})
      }
      if (dev) {
        await runDevSupervisor(projectRoot, env)
        return
      }
      const proc = spawnServer(projectRoot, env)
      await proc.exited
      process.exit(proc.exitCode ?? 0)
    }

    // This IS the server process (MOI_SERVER=1, cwd=projectRoot, bunfig.toml loaded).
    await import('./web')
    console.log(`\n${pc.green('✓')} Server started on http://localhost:${PORT}`)
    console.log(pc.dim('  Press Ctrl+C to stop\n'))
    // Stay alive as the server
  }
})

function colorStatus(status: string) {
  if (status === 'built') return pc.green(status)
  if (status === 'failed') return pc.red(status)
  return pc.dim(status)
}

const bundle = defineCommand({
  meta: { name: 'bundle', description: 'Rebuild changed widgets and views' },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    force: {
      type: 'boolean',
      description: 'Rebuild everything, ignoring file modification times',
      default: false
    },
    only: {
      type: 'string',
      description: 'Narrow the build to "widgets" or "views" (default: both)'
    }
  },
  run({ args }) {
    const path = resolve(args.dir)
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () =>
      ws.send(JSON.stringify({ type: 'bundle', path, force: args.force, only: args.only }))

    ws.onmessage = event => {
      const res = JSON.parse(String(event.data))

      // The server fails loudly when the path isn't inside a registered
      // workspace (e.g. run from an unrelated dir) instead of silently no-op'ing.
      if (res.error) {
        console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + res.error + '\n')
        ws.close()
        process.exit(1)
      }

      type Row = { kind?: string; name: string; status: string; error?: string }
      const results: Row[] = Array.isArray(res.results) ? res.results : []
      const where = typeof res.workspacePath === 'string' ? res.workspacePath : path

      // Empty here means a *real* workspace with no widgets/views — not the old
      // "wrong dir" footgun (that's an error above now). Say so plainly.
      if (results.length === 0) {
        console.log(
          '\n' +
            pc.bold('moi bundle') +
            pc.dim(' — nothing to build') +
            '\n\n' +
            pc.dim(`  No widgets or views found in ${where}/.moi/`) +
            '\n'
        )
        ws.close()
        process.exit(0)
      }

      const counts: Record<string, number> = {}
      for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1
      const summary = ['built', 'skipped', 'failed']
        .filter(s => counts[s])
        .map(s => `${counts[s]} ${s}`)
        .join(' · ')

      console.log('\n' + pc.bold('moi bundle') + pc.dim(` — ${summary}`) + '\n')
      console.log(
        columns(
          ['kind', 'name', 'status'].map(h => pc.dim(h)),
          results.map(r => [pc.dim(r.kind ?? ''), r.name, colorStatus(r.status)])
        )
      )

      const failed = results.filter(r => r.status === 'failed')
      console.log()
      for (const f of failed) {
        console.log(pc.red(pc.bold(f.name + ':')))
        console.log('  ' + f.error + '\n')
      }

      ws.close()
      process.exit(failed.length > 0 ? 1 : 0)
    }

    ws.onerror = () => {
      console.error('Could not connect to control server. Is the main process running?')
      process.exit(1)
    }
  }
})

const refresh = defineCommand({
  meta: {
    name: 'refresh',
    description:
      'Refresh widget data without rebuilding. Use after the agent mutates underlying data.'
  },
  run() {
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'widget:refresh' }))

    ws.onmessage = event => {
      const data = JSON.parse(String(event.data))
      if (data.error) {
        console.error('\n' + pc.red('✗') + ' ' + data.error + '\n')
        ws.close()
        process.exit(1)
      }
      console.log('\n' + pc.green('✓') + ' Refresh signal sent\n')
      ws.close()
      process.exit(0)
    }

    ws.onerror = () => {
      console.error('Could not connect to control server. Is the main process running?')
      process.exit(1)
    }
  }
})

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

// Truecolor swatch using raw ANSI 24-bit escapes (picocolors maxes at 8 colors).
// Falls back to blank spaces when stdout is not a TTY, keeping piped output clean.
function swatch(bg?: string, fg?: string): string {
  if (!process.stdout.isTTY || !bg) return '    '
  const [br, bgg, bb] = hexToRgb(bg)
  const [fr, fgg, fb] = hexToRgb(fg ?? '#000000')
  return `\x1b[48;2;${br};${bgg};${bb}m\x1b[38;2;${fr};${fgg};${fb}m Aa \x1b[0m`
}

const theme = defineCommand({
  meta: { name: 'theme', description: 'Show or set the workspace font and color themes' },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    font: { type: 'string', description: 'Font theme key to apply' },
    color: { type: 'string', description: 'Color preset key to apply' }
  },
  run({ args }) {
    const path = resolve(args.dir)
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'theme',
          path,
          font: args.font ?? null,
          color: args.color ?? null
        })
      )

    ws.onmessage = event => {
      const res = JSON.parse(String(event.data))

      if (res.error) {
        console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + res.error + '\n')
        ws.close()
        process.exit(1)
      }

      if (res.ok) {
        console.log()
        if (res.font) {
          const config = FONT_THEMES[res.font as FontTheme]
          console.log(
            pc.green('✓') +
              ' Font set to ' +
              pc.bold(config.label) +
              pc.dim(` (${config.sans} / ${config.mono})`)
          )
        }
        if (res.color) {
          const preset = COLOR_THEMES[res.color as ColorTheme]
          const chip = swatch(preset.background, preset.foreground)
          console.log(pc.green('✓') + ' Color set to ' + pc.bold(preset.label) + ' ' + chip)
        }
        console.log()
        ws.close()
        process.exit(0)
      }

      const currentFont: FontTheme = res.currentFont ?? 'default'
      const currentColor: ColorTheme | null = res.currentColor ?? null
      console.log('\n' + pc.bold('moi theme') + ' — workspace appearance')
      console.log(pc.dim('  Usage: moi theme --font=<key> --color=<key>') + '\n')

      const fontRows = (Object.keys(FONT_THEMES) as FontTheme[]).map(key => {
        const f = FONT_THEMES[key]
        const selected = key === currentFont
        return [
          selected ? pc.green('→') : ' ',
          selected ? pc.bold(key) : key,
          f.label,
          pc.dim(f.sans),
          pc.dim(f.mono),
          pc.dim(f.feel)
        ]
      })
      console.log(pc.dim('  Fonts'))
      console.log(
        columns(
          ['', 'key', 'label', 'sans', 'mono', 'feel'].map(h => pc.dim(h)),
          fontRows
        ) + '\n'
      )

      const colorRows = (Object.keys(COLOR_THEMES) as ColorTheme[]).map(key => {
        const c = COLOR_THEMES[key]
        const selected = key === currentColor
        return [
          selected ? pc.green('→') : ' ',
          selected ? pc.bold(key) : key,
          c.label,
          swatch(c.background, c.foreground),
          pc.dim(c.feel)
        ]
      })
      console.log(pc.dim('  Colors'))
      console.log(
        columns(
          ['', 'key', 'label', 'swatch', 'feel'].map(h => pc.dim(h)),
          colorRows
        ) + '\n'
      )

      ws.close()
      process.exit(0)
    }

    ws.onerror = () => {
      console.error('Could not connect to control server. Is the main process running?')
      process.exit(1)
    }
  }
})

const status = defineCommand({
  meta: { name: 'status', description: 'Show server status and registered workspaces' },
  async run() {
    const running = await isServerRunning()

    if (!running) {
      console.log('\n' + pc.dim('○') + ' Server is ' + pc.bold('not running') + '\n')
      process.exit(0)
    }

    console.log(
      '\n' +
        pc.green('●') +
        ' Server is ' +
        pc.bold('running') +
        pc.dim(`  (http port: ${PORT}, control port: ${CONTROL_PORT})`)
    )

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

      ws.onopen = () => ws.send(JSON.stringify({ type: 'workspace:list' }))

      ws.onmessage = event => {
        const res = JSON.parse(String(event.data))
        const workspaces: { id: string; path: string; addedAt: string }[] = res.workspaces ?? []
        const n = workspaces.length
        console.log(pc.dim(`  ${n} workspace${n === 1 ? '' : 's'} registered\n`))

        ws.close()
        resolve()
      }

      ws.onerror = () => reject(new Error('Could not connect to control server'))
    })

    process.exit(0)
  }
})

// ---- openclaw subcommands ---------------------------------------------------

// Match an `agent` argument against `agentId` (exact) or `name`
// (case-insensitive). Returns the matching agent or null.
function findAgent(agents: OpenClawAgent[], query: string): OpenClawAgent | null {
  const exact = agents.find(a => a.agentId === query)
  if (exact) return exact
  const q = query.toLowerCase()
  return agents.find(a => a.name?.toLowerCase() === q) ?? null
}

function printAgentTable(agents: OpenClawAgent[]) {
  console.log(
    columns(
      ['', 'agentId', 'name', 'workspace'].map(h => pc.dim(h)),
      agents.map(a => [
        a.isDefault ? pc.green('●') : ' ',
        a.isDefault ? pc.bold(a.agentId) : a.agentId,
        a.name ?? pc.dim('—'),
        pc.dim(a.path)
      ])
    )
  )
}

const openclawInit = defineCommand({
  meta: {
    name: 'init',
    description:
      'Install moi skills into an OpenClaw agent workspace. Run without args to list discovered agents.'
  },
  args: {
    agent: {
      type: 'positional',
      required: false,
      description: 'Agent id or name (omit to list agents)'
    }
  },
  async run({ args }) {
    const agents = await discoverOpenClawAgents()
    if (agents.length === 0) {
      console.error(
        '\n' +
          pc.red('✗') +
          ' No OpenClaw agents discovered.\n' +
          pc.dim(
            '  Make sure the OpenClaw gateway is running and ~/.openclaw/openclaw.json is set.\n'
          )
      )
      process.exit(1)
    }

    if (!args.agent) {
      console.log('\n' + pc.bold('OpenClaw agents'))
      console.log(
        pc.dim('  Run ' + pc.bold('moi openclaw init <agentId>') + ' to install skills.\n')
      )
      printAgentTable(agents)
      console.log()
      process.exit(0)
    }

    const target = findAgent(agents, args.agent)
    if (!target) {
      console.error('\n' + pc.red('✗') + ' Agent not found: ' + pc.bold(args.agent) + '\n')
      console.log('  Available:\n')
      printAgentTable(agents)
      console.log()
      process.exit(1)
    }

    // Copy each shipped skill folder into <agent-workspace>/skills/<name>/.
    // OpenClaw resolves <workspace>/skills with the highest precedence, so
    // these win over any same-named bundled or per-user skill.
    const skillsRoot = join(target.path, 'skills')
    await installBundledSkills(skillsRoot)

    // Same `.moi/` bootstrap as `moi init` — the widgets skill assumes the
    // folder and its dependencies exist. Existing `.moi/` stays untouched.
    const scaffold = await scaffoldMoiDir(target.path)
    if (scaffold !== 'exists') {
      console.log('\n' + pc.dim('  Installed widget dependencies in .moi/'))
      if (scaffold !== 0) {
        console.warn(pc.yellow('  bun install failed — run it manually in .moi/'))
      }
    }

    // Register in the moi registry so the agent's workspace appears in the
    // UI workspace list. Mirrors what `moi init` does for Claude Code.
    const entry = await registerWorkspace(target.path, {
      type: 'openclaw',
      name: target.name,
      agentId: target.agentId,
      isDefault: target.isDefault,
      lastRunAt: target.lastRunAt
    })

    console.log('\n' + pc.green('✓') + ' Installed skills to ' + pc.bold(skillsRoot))
    console.log(
      pc.dim('  Agent: ') +
        pc.bold(target.agentId) +
        (target.name ? pc.dim(' (' + target.name + ')') : '')
    )
    const isInteractive = process.stdout.isTTY
    const running = await isServerRunning()
    if (running) {
      const url = `http://localhost:${PORT}/workspace/${entry.id}`
      // Notify the running server so it picks up the new entry without a
      // restart, then open (browser only in interactive mode) — same shape
      // as `moi init`'s already-running branch.
      await registerViaControl(target.path)
      if (isInteractive) {
        console.log('  Opening ' + pc.bold(url) + '\n')
        await openBrowser(url)
      } else {
        console.log('  Ready at ' + pc.bold(url) + '\n')
      }
    } else {
      console.log('  Run ' + pc.bold('moi start') + ' to open in the browser\n')
    }
    process.exit(0)
  }
})

const openclaw = defineCommand({
  meta: { name: 'openclaw', description: 'OpenClaw integration commands' },
  subCommands: { init: openclawInit }
})

function sendConfig(payload: {
  path: string
  name?: string
  iconPath?: string
  clearName?: boolean
  clearIcon?: boolean
}) {
  const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)
  ws.onopen = () => ws.send(JSON.stringify({ type: 'config', ...payload }))
  ws.onmessage = event => {
    const res = JSON.parse(String(event.data))
    if (res.error) {
      console.error('\n' + pc.red(pc.bold('Error:')) + ' ' + res.error + '\n')
      ws.close()
      process.exit(1)
    }
    console.log()
    if (res.ok) {
      if (res.clearedName) console.log(pc.green('✓') + ' Name reset to ' + pc.dim('(folder name)'))
      else if (res.name) console.log(pc.green('✓') + ' Name set to ' + pc.bold(res.name))
      if (res.clearedIcon)
        console.log(pc.green('✓') + ' Icon reset to ' + pc.dim('default (provider)'))
      else if (res.icon) console.log(pc.green('✓') + ' Icon updated ' + pc.dim('(128×128 webp)'))
    } else {
      console.log(pc.bold('moi config') + ' — workspace identity\n')
      console.log(
        '  ' + pc.dim('name') + '  ' + (res.name ? pc.bold(res.name) : pc.dim('(folder name)'))
      )
      console.log(
        '  ' +
          pc.dim('icon') +
          '  ' +
          (res.hasIcon ? pc.green('custom') : pc.dim('default (provider)'))
      )
    }
    console.log()
    ws.close()
    process.exit(0)
  }
  ws.onerror = () => {
    console.error('Could not connect to control server. Is the main process running?')
    process.exit(1)
  }
}

// A terse cheat sheet — one line per command — so an agent can grasp the
// surface at a glance instead of parsing citty's full ARGUMENTS/OPTIONS dump.
function printConfigHelp() {
  const row = (cmd: string, desc: string) => '  ' + pc.cyan(cmd.padEnd(34)) + pc.dim(desc)
  console.log()
  console.log(pc.bold('moi config') + pc.dim(' — workspace name & icon'))
  console.log()
  console.log(row('moi config', 'Show current name & icon'))
  console.log(row('moi config name "My WS"', 'Set the display name'))
  console.log(row('moi config name --clear', 'Reset name to folder default'))
  console.log(row('moi config icon ./logo.png', 'Set icon (png/jpg/gif/webp → 128×128 webp)'))
  console.log(row('moi config icon --clear', 'Reset icon to provider default'))
  console.log(row('  --dir <path>', 'Target workspace (default: current dir)'))
  console.log()
}

const config = defineCommand({
  meta: {
    name: 'config',
    description: 'Show or set the workspace name and icon (moi config [name|icon] <value>)'
  },
  args: {
    field: {
      type: 'positional',
      required: false,
      description: '"name" or "icon" — omit to show the current config'
    },
    value: {
      type: 'positional',
      required: false,
      description: 'The new name, or a path to an image file (png/jpg/gif/webp)'
    },
    clear: {
      type: 'boolean',
      description: 'Reset the field to its default (folder name / provider icon)'
    },
    dir: { type: 'string', default: '.', description: 'Workspace directory (default: current)' }
  },
  run({ args }) {
    const path = resolve(args.dir)
    if (args.field === 'help') {
      printConfigHelp()
      return
    }
    if (!args.field) {
      sendConfig({ path })
      return
    }
    if (args.field === 'name') {
      if (args.clear) {
        sendConfig({ path, clearName: true })
        return
      }
      if (!args.value) {
        console.error(pc.red('Usage:') + ' moi config name "<workspace name>"')
        process.exit(1)
      }
      sendConfig({ path, name: args.value })
    } else if (args.field === 'icon') {
      if (args.clear) {
        sendConfig({ path, clearIcon: true })
        return
      }
      if (!args.value) {
        console.error(pc.red('Usage:') + ' moi config icon <path-to-image>')
        process.exit(1)
      }
      sendConfig({ path, iconPath: resolve(args.value) })
    } else {
      console.error(
        pc.red(`Unknown field "${args.field}".`) +
          ' Use ' +
          pc.bold('name') +
          ' or ' +
          pc.bold('icon') +
          '.'
      )
      process.exit(1)
    }
  }
})

// ---- scratch (Scratchpad canvas) --------------------------------------------

// Parse a "x,y" coordinate pair (tldraw canvas space, y down).
function parseXY(s: string): { x: number; y: number } {
  const parts = s.split(',').map(p => Number(p.trim()))
  if (parts.length !== 2 || !parts.every(n => Number.isFinite(n))) {
    throw new Error(`Expected "x,y", got "${s}"`)
  }
  return { x: parts[0], y: parts[1] }
}

// An arrow endpoint: a bare "x,y" is a free point; anything else is a shape name
// to bind to (so the arrow follows that shape).
function parseEnd(s: string): ScratchArrowEnd {
  if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(s)) return parseXY(s)
  return { name: s }
}

type ScratchCliOp = ScratchOp | { kind: 'read' }

// Round-trip one op through the control port and hand the reply to `onResult`.
// Mirrors the `bundle`/`theme` commands: one socket per invocation, print, exit.
function sendScratch(
  path: string,
  op: ScratchCliOp,
  onResult: (res: Record<string, unknown>) => void | Promise<void>
) {
  const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)
  ws.onopen = () => ws.send(JSON.stringify({ type: 'scratch', path, op }))
  ws.onmessage = async event => {
    const res = JSON.parse(String(event.data))
    if (res.error) {
      console.error('\n' + pc.red('✗') + ' ' + res.error + '\n')
      ws.close()
      process.exit(1)
    }
    await onResult(res)
    ws.close()
    process.exit(0)
  }
  ws.onerror = () => {
    console.error('Could not connect to control server. Is the main process running?')
    process.exit(1)
  }
}

// Print the name a draw op landed on, so the agent can address it later.
function printAdded(res: Record<string, unknown>) {
  const result = res.result as { name?: string } | undefined
  console.log('\n' + pc.green('✓') + ' added ' + pc.bold(result?.name ?? '(shape)') + '\n')
}

const dirArg = {
  type: 'string',
  default: '.',
  description: 'Workspace directory (default: current)'
} as const

const scratchRead = defineCommand({
  meta: { name: 'read', description: 'Print the canvas shapes as JSON (served off disk)' },
  args: { dir: dirArg },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'read' }, res => {
      console.log(JSON.stringify(res.shapes ?? [], null, 2))
    })
  }
})

const scratchView = defineCommand({
  meta: { name: 'view', description: 'Render the canvas to a PNG (needs an open Scratchpad tab)' },
  args: {
    dir: dirArg,
    out: { type: 'string', description: 'Output PNG path (default: a temp file)' }
  },
  async run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'view' }, async res => {
      const result = res.result as { image?: string } | undefined
      if (!result?.image) {
        console.error(pc.red('No image returned'))
        process.exit(1)
      }
      const b64 = result.image.replace(/^data:image\/png;base64,/, '')
      const outPath = args.out ? resolve(args.out) : join(tmpdir(), `moi-scratch-${Date.now()}.png`)
      await Bun.write(outPath, Buffer.from(b64, 'base64'))
      console.log(outPath)
    })
  }
})

const scratchAddText = defineCommand({
  meta: { name: 'text', description: 'Add a text shape' },
  args: {
    at: { type: 'string', required: true, description: 'Position "x,y"' },
    text: { type: 'string', required: true, description: 'Text content' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    sendScratch(
      resolve(args.dir),
      { kind: 'add-text', name: args.id ?? '', x, y, text: args.text },
      printAdded
    )
  }
})

const scratchAddRect = defineCommand({
  meta: { name: 'rect', description: 'Add a rectangle' },
  args: {
    at: { type: 'string', required: true, description: 'Top-left position "x,y"' },
    size: { type: 'string', required: true, description: 'Size "w,h"' },
    text: { type: 'string', description: 'Optional label' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    const { x: w, y: h } = parseXY(args.size)
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-rect',
        name: args.id ?? '',
        x,
        y,
        w,
        h,
        ...(args.text ? { text: args.text } : {})
      },
      printAdded
    )
  }
})

const scratchAddNote = defineCommand({
  meta: { name: 'note', description: 'Add a sticky note' },
  args: {
    at: { type: 'string', required: true, description: 'Position "x,y"' },
    text: { type: 'string', required: true, description: 'Note content' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    sendScratch(
      resolve(args.dir),
      { kind: 'add-note', name: args.id ?? '', x, y, text: args.text },
      printAdded
    )
  }
})

const scratchAddArrow = defineCommand({
  meta: { name: 'arrow', description: 'Add an arrow between shapes or points' },
  args: {
    from: { type: 'string', required: true, description: 'Start: a shape name or "x,y"' },
    to: { type: 'string', required: true, description: 'End: a shape name or "x,y"' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    dir: dirArg
  },
  run({ args }) {
    sendScratch(
      resolve(args.dir),
      { kind: 'add-arrow', name: args.id ?? '', from: parseEnd(args.from), to: parseEnd(args.to) },
      printAdded
    )
  }
})

const scratchAdd = defineCommand({
  meta: { name: 'add', description: 'Add a shape: text, rect, note, or arrow' },
  subCommands: {
    text: scratchAddText,
    rect: scratchAddRect,
    note: scratchAddNote,
    arrow: scratchAddArrow
  }
})

const scratchMove = defineCommand({
  meta: { name: 'move', description: 'Move a shape to a new position' },
  args: {
    id: { type: 'positional', required: true, description: 'Shape name' },
    to: { type: 'string', required: true, description: 'New position "x,y"' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.to)
    sendScratch(resolve(args.dir), { kind: 'move', name: args.id, x, y }, () =>
      console.log('\n' + pc.green('✓') + ' moved ' + pc.bold(args.id) + '\n')
    )
  }
})

const scratchSet = defineCommand({
  meta: { name: 'set', description: "Relabel / edit a shape's text" },
  args: {
    id: { type: 'positional', required: true, description: 'Shape name' },
    text: { type: 'string', required: true, description: 'New text' },
    dir: dirArg
  },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'set', name: args.id, text: args.text }, () =>
      console.log('\n' + pc.green('✓') + ' updated ' + pc.bold(args.id) + '\n')
    )
  }
})

const scratchDelete = defineCommand({
  meta: { name: 'delete', description: 'Delete a shape' },
  args: {
    id: { type: 'positional', required: true, description: 'Shape name' },
    dir: dirArg
  },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'delete', name: args.id }, () =>
      console.log('\n' + pc.green('✓') + ' deleted ' + pc.bold(args.id) + '\n')
    )
  }
})

const scratch = defineCommand({
  meta: {
    name: 'scratch',
    description: 'Read and draw on the workspace Scratchpad canvas'
  },
  subCommands: {
    read: scratchRead,
    view: scratchView,
    add: scratchAdd,
    move: scratchMove,
    set: scratchSet,
    delete: scratchDelete
  }
})

const main = defineCommand({
  meta: { name: 'moi', description: 'moi — local AI workspace' },
  subCommands: { init, start, bundle, refresh, theme, config, status, openclaw, scratch }
})

// Route `moi config --help` to the same terse cheat sheet as `moi config help`;
// every other command keeps citty's default usage renderer.
runMain(main, {
  async showUsage(cmd, parent) {
    const meta = typeof cmd.meta === 'function' ? await cmd.meta() : await cmd.meta
    if (meta?.name === 'config') {
      printConfigHelp()
      return
    }
    await showUsage(cmd, parent)
  }
})
