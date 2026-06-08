#!/usr/bin/env bun
import { defineCommand, runMain } from 'citty'
import Table from 'cli-table3'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'path'
import pc from 'picocolors'

import { COLOR_THEMES, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme } from '@/lib/themes'

import { CONTROL_PORT, PORT } from './constants'
import { type OpenClawAgent, discoverOpenClawAgents } from './openclaw'
import { registerWorkspace } from './registry'
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
    const target = resolve(args.dir)
    const projectRoot = join(import.meta.dir, '..')
    const isInteractive = process.stdout.isTTY

    await mkdir(target, { recursive: true })
    await installBundledSkills(join(target, '.claude', 'skills'))

    // Always register the workspace in the persistent registry
    const entry = await registerWorkspace(target)

    console.log('\n' + pc.green('✓') + ' Initialized ' + pc.bold(target))
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
  meta: { name: 'bundle', description: 'Rebuild changed widgets' },
  args: {
    dir: {
      type: 'positional',
      default: '.',
      description: 'Workspace directory (default: current)'
    },
    force: {
      type: 'boolean',
      description: 'Rebuild all widgets, ignoring file modification times',
      default: false
    }
  },
  run({ args }) {
    const path = resolve(args.dir)
    const ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'bundle', path, force: args.force }))

    ws.onmessage = event => {
      const results = JSON.parse(String(event.data))
      if (!Array.isArray(results)) return

      const table = new Table({ head: [pc.bold('widget'), pc.bold('status')] })
      for (const r of results as { name: string; status: string; error?: string }[]) {
        table.push([r.name, colorStatus(r.status)])
      }
      console.log('\n' + table.toString())

      const failed = results.filter(
        (r: { status: string; error?: string }) => r.status === 'failed'
      )
      if (failed.length) {
        console.log()
        for (const f of failed) {
          console.log(pc.red(pc.bold(f.name + ':')))
          console.log('  ' + f.error + '\n')
        }
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

      const fontTable = new Table({
        head: ['', 'key', 'label', 'sans', 'mono', 'feel'].map(h => pc.bold(h)),
        style: { border: [], head: [] }
      })
      for (const key of Object.keys(FONT_THEMES) as FontTheme[]) {
        const f = FONT_THEMES[key]
        const selected = key === currentFont
        fontTable.push([
          selected ? pc.green('→') : '',
          selected ? pc.bold(key) : key,
          f.label,
          pc.dim(f.sans),
          pc.dim(f.mono),
          pc.dim(f.feel)
        ])
      }
      console.log(pc.dim('  Fonts'))
      console.log(fontTable.toString() + '\n')

      const colorTable = new Table({
        head: ['', 'key', 'label', 'swatch', 'feel'].map(h => pc.bold(h)),
        style: { border: [], head: [] }
      })
      for (const key of Object.keys(COLOR_THEMES) as ColorTheme[]) {
        const c = COLOR_THEMES[key]
        const selected = key === currentColor
        colorTable.push([
          selected ? pc.green('→') : '',
          selected ? pc.bold(key) : key,
          c.label,
          swatch(c.background, c.foreground),
          pc.dim(c.feel)
        ])
      }
      console.log(pc.dim('  Colors'))
      console.log(colorTable.toString() + '\n')

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
  const table = new Table({
    head: ['', pc.bold('agentId'), pc.bold('name'), pc.bold('workspace')],
    style: { border: [], head: [] }
  })
  for (const a of agents) {
    table.push([
      a.isDefault ? pc.green('●') : '',
      a.isDefault ? pc.bold(a.agentId) : a.agentId,
      a.name ?? pc.dim('—'),
      pc.dim(a.path)
    ])
  }
  console.log(table.toString())
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

const main = defineCommand({
  meta: { name: 'moi', description: 'moi — local AI workspace' },
  subCommands: { init, start, bundle, refresh, theme, status, openclaw }
})

runMain(main)
