#!/usr/bin/env bun
import './cli-colors' // must precede citty: sets NO_COLOR before its color flag is computed
import { defineCommand, runMain, showUsage } from 'citty'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'path'
import pc from 'picocolors'

import { COLOR_THEMES, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme } from '@/lib/themes'
import type {
  ScratchArrowEnd,
  ScratchColor,
  ScratchFill,
  ScratchImageQuality,
  ScratchOp,
  ScratchSize,
  ScratchStyle
} from '@/lib/types'

import {
  execWithEnv,
  notifyEnvChanged,
  readSecretValue,
  renderEnvView,
  resolveCwdWorkspace
} from './cli-env'
import { columns } from './cli-ui'
import { CONTROL_PORT, PORT } from './constants'
import { type OpenClawAgent, discoverOpenClawAgents } from './openclaw'
import { liftToWorkspaceRoot, registerWorkspace } from './registry'
import { serverCwd } from './server-cwd'
import {
  type SkillStatus,
  isBehind,
  isMinorBehind,
  resolveWorkspace,
  skillStatuses,
  staleSkillNotice
} from './skill-version'
import { installBundledSkills } from './skills-template'
import {
  getWorkspaceEnvView,
  isValidEnvKey,
  secretBackend,
  updateWorkspaceEnv
} from './workspace-env'
import { provisionWorkspace, skillsDirFor } from './workspace-init'

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

// Spawn the server as a child. MOI_SERVER=1 tells the child it is the actual
// server process. No `--hot`: frontend HMR comes from Bun.serve's dev bundler,
// and server reloads are a full process restart driven by the dev supervisor
// (see runDevSupervisor).
function spawnServer(
  cwd: string,
  env: Record<string, string | undefined> = process.env
): ReturnType<typeof Bun.spawn> {
  return Bun.spawn(['bun', import.meta.filename, 'start'], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    cwd,
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

    // Detect an OpenClaw agent workspace before provisioning: skills must land
    // in `skills/` (not `.claude/skills/`) and the registry entry must carry
    // the agent metadata — same as `moi openclaw init <agent>`. Discovery
    // returns [] when the gateway is down, so this never blocks a plain init.
    const agent = (await discoverOpenClawAgents()).find(a => a.path === target) ?? null
    if (agent) {
      console.log(
        '\n' +
          pc.yellow('◆') +
          ' Detected an OpenClaw agent workspace ' +
          pc.dim('(' + agent.agentId + (agent.name ? ', ' + agent.name : '') + ')') +
          ' — initializing for OpenClaw.'
      )
    }

    // Provision: bundled skills + the `.moi/` bootstrap (widgets dir +
    // package.json + bun install). An existing `.moi/` is left untouched.
    console.log()
    const { scaffold, skillsDir } = await provisionWorkspace(
      target,
      agent ? 'openclaw' : 'claude-code'
    )
    if (scaffold !== 'exists') {
      console.log(pc.dim('  Installed widget dependencies in .moi/'))
      if (scaffold !== 0) {
        console.warn(pc.yellow('  bun install failed — run it manually in .moi/'))
      }
    }

    // Always register the workspace in the persistent registry
    const entry = await registerWorkspace(
      target,
      agent
        ? {
            type: 'openclaw',
            name: agent.name,
            agentId: agent.agentId,
            isDefault: agent.isDefault,
            lastRunAt: agent.lastRunAt
          }
        : { type: 'claude-code' }
    )

    console.log(pc.green('✓') + ' Initialized ' + pc.bold(target))
    console.log(
      '  Skills installed to ' +
        pc.dim(skillsDir) +
        ' — ask ' +
        (agent ? 'your agent' : 'Claude') +
        ' to build a widget to get started\n'
    )

    // If --web and server not running, start it (stay alive as wrapper)
    let running = await isServerRunning()

    if (!running && args.web) {
      console.log(pc.dim('  Starting server…'))
      const proc = spawnServer(serverCwd(projectRoot, false))
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
      description: 'HTTP port to listen on (default: 13337)'
    }
  },
  async run({ args }) {
    const projectRoot = join(import.meta.dir, '..')
    // Undocumented: --dev runs the watch-and-full-restart dev supervisor.
    const dev = process.argv.includes('--dev')
    // Undocumented: --debug turns on the messaging trace (MOI_DEBUG) in the
    // server — console lines for each message/session/turn in the chat pipeline.
    const debug = process.argv.includes('--debug')

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
        // The dev bundler snapshots process.env at server startup, so the
        // PUBLIC_* inlining (bunfig `[serve.static] env`) only sees vars that
        // are set before the server process spawns — setting one later from
        // server code does nothing. Default the tldraw key here so an unset
        // key inlines as '' (→ watermark) instead of leaving a bare
        // `process.env.…` in the browser bundle that throws.
        PUBLIC_TLDRAW_LICENSE_KEY: process.env.PUBLIC_TLDRAW_LICENSE_KEY ?? '',
        ...(args.port ? { PORT: args.port } : {}),
        ...(dev ? { MOI_DEV: '1' } : {}),
        ...(debug ? { MOI_DEBUG: '1' } : {})
      }
      if (dev) {
        await runDevSupervisor(projectRoot, env)
        return
      }
      const proc = spawnServer(serverCwd(projectRoot, dev), env)
      await proc.exited
      process.exit(proc.exitCode ?? 0)
    }

    // This IS the server process (MOI_SERVER=1). cwd is the package root when the
    // dev bundler runs (bunfig loaded at Bun startup) or a neutral dir for a
    // prebuilt install — see serverCwd().
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
  async run({ args }) {
    const path = resolve(args.dir)
    // Computed locally up front so it can ride along in the success output; the
    // agent reads this and knows to run `moi skill update`.
    const notice = await staleSkillNotice(path)
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
        if (notice) console.log(pc.yellow(notice) + '\n')
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

      if (notice) console.log(pc.yellow(notice) + '\n')
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
  async run() {
    const notice = await staleSkillNotice(process.cwd())
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
      if (notice) console.log(pc.yellow(notice) + '\n')
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
  async run({ args }) {
    const path = resolve(args.dir)
    const notice = await staleSkillNotice(path)
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
        if (notice) console.log(pc.yellow(notice) + '\n')
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

      if (notice) console.log(pc.yellow(notice) + '\n')
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
    const notice = await staleSkillNotice(process.cwd())

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

    if (notice) console.log(pc.yellow(notice) + '\n')
    process.exit(0)
  }
})

// ---- env subcommands --------------------------------------------------------

function envFail(message: string): never {
  console.error('\n' + pc.red('✗') + ' ' + message + '\n')
  process.exit(1)
}

const envSet = defineCommand({
  meta: {
    name: 'set',
    description:
      'Set custom secrets: `moi env set KEY=value [KEY=value...]`, or `moi env set KEY` to read one value from stdin'
  },
  args: {
    key: {
      type: 'positional',
      required: true,
      description: 'KEY=value pair(s), or a single bare KEY to read the value from stdin'
    }
  },
  async run({ args }) {
    const entry = await resolveCwdWorkspace()
    const pairs = args._
    const set: Record<string, string> = {}

    if (pairs.length === 1 && !pairs[0].includes('=')) {
      // Bare-KEY form: one key, value from stdin (hidden prompt on a TTY).
      const key = pairs[0]
      if (!isValidEnvKey(key)) envFail(`Invalid env key: ${key}`)
      let value: string
      try {
        value = await readSecretValue(key)
      } catch {
        // Ctrl-C at the hidden prompt.
        process.exit(1)
      }
      // An empty value is almost always an unset variable on the piping side —
      // storing '' would silently shadow a real .env value with nothing.
      if (value === '')
        envFail(`Empty value for ${key} — pipe a non-empty value or pass ${key}=value`)
      set[key] = value
    } else {
      for (const pair of pairs) {
        const eq = pair.indexOf('=')
        if (eq === -1) {
          envFail(
            `Missing value for ${pair} — use KEY=value (bare KEY reads stdin only when set alone)`
          )
        }
        const key = pair.slice(0, eq)
        const value = pair.slice(eq + 1)
        if (!isValidEnvKey(key)) envFail(`Invalid env key: ${key}`)
        if (value === '')
          envFail(`Empty value for ${key} — use \`moi env unset ${key}\` to remove a key`)
        set[key] = value
      }
    }

    await updateWorkspaceEnv(entry.path, { set })
    await notifyEnvChanged(entry.path)
    for (const key of Object.keys(set)) {
      console.log(pc.green('✓') + ` Set ${pc.bold(key)} ${pc.dim('(custom)')}`)
    }
    // A plaintext fallback should never go unnoticed at write time.
    if ((await secretBackend()) === 'file') {
      console.log(pc.dim('  Stored in a 0600 file — OS keychain unavailable.'))
    }
    process.exit(0)
  }
})

const envUnset = defineCommand({
  meta: { name: 'unset', description: 'Remove custom secrets: `moi env unset KEY [KEY...]`' },
  args: {
    key: { type: 'positional', required: true, description: 'Key(s) to remove' }
  },
  async run({ args }) {
    const entry = await resolveCwdWorkspace()
    const view = await getWorkspaceEnvView(entry.path)
    const byKey = new Map(view.vars.map(v => [v.key, v]))

    // Only custom secrets are removable; a dotenv-sourced key lives in its file.
    const removable: string[] = []
    let hadError = false
    for (const key of args._) {
      const v = byKey.get(key)
      if (!v) {
        console.warn(pc.yellow('!') + ` ${key} is not set — skipping`)
        continue
      }
      if (v.source === 'dotenv') {
        console.error(
          pc.red('✗') +
            ` ${key} comes from ${(v.files ?? []).join(', ')} — edit that file instead` +
            pc.dim(' (moi env unset only removes custom secrets)')
        )
        hadError = true
        continue
      }
      removable.push(key)
    }

    if (removable.length > 0) {
      await updateWorkspaceEnv(entry.path, { remove: removable })
      await notifyEnvChanged(entry.path)
      for (const key of removable) {
        const v = byKey.get(key)
        const unshadow =
          v?.source === 'both' ? pc.dim(` (falls back to ${(v.files ?? []).join(', ')})`) : ''
        console.log(pc.green('✓') + ` Removed ${pc.bold(key)}${unshadow}`)
      }
    }
    process.exit(hadError ? 1 : 0)
  }
})

const envExec = defineCommand({
  meta: {
    name: 'exec',
    description: 'Run a command with the workspace env: `moi env exec -- <cmd> [args...]`'
  },
  async run({ rawArgs }) {
    // Everything after `--` is the child command, untouched by flag parsing.
    const sep = rawArgs.indexOf('--')
    const cmd = sep === -1 ? [] : rawArgs.slice(sep + 1)
    if (cmd.length === 0) {
      console.error('\n' + pc.red('✗') + ' Usage: moi env exec -- <cmd> [args...]\n')
      process.exit(1)
    }
    const entry = await resolveCwdWorkspace()
    process.exit(await execWithEnv(entry.path, cmd))
  }
})

const envSubCommands = { set: envSet, unset: envUnset, exec: envExec }

const env = defineCommand({
  meta: {
    name: 'env',
    description: 'Show the workspace env (key names only — never values)'
  },
  subCommands: envSubCommands,
  async run({ rawArgs }) {
    // citty invokes the parent run even after dispatching a subcommand — only
    // render the table when no subcommand ran. Object.hasOwn so prototype
    // names ('constructor', 'toString') never count as a dispatched command.
    const first = rawArgs.find(a => !a.startsWith('-'))
    if (first && Object.hasOwn(envSubCommands, first)) return
    const entry = await resolveCwdWorkspace()
    // Lazy: required-env pulls the widget/view bundler chain (TS compiler),
    // which must not load for every other `moi` command's startup.
    const { requiredEnvFor } = await import('./required-env')
    const view = await getWorkspaceEnvView(entry.path, requiredEnvFor(entry.path))
    console.log('\n' + renderEnvView(entry, view) + '\n')
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

    // Shared provisioning path with `moi init`: skills land in
    // <agent-workspace>/skills/<name>/ (OpenClaw resolves <workspace>/skills
    // with the highest precedence, so these win over any same-named bundled or
    // per-user skill), plus the `.moi/` bootstrap — the widgets skill assumes
    // the folder and its dependencies exist. Existing `.moi/` stays untouched.
    const { scaffold, skillsDir: skillsRoot } = await provisionWorkspace(target.path, 'openclaw')
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

async function sendConfig(payload: {
  path: string
  name?: string
  iconPath?: string
  clearName?: boolean
  clearIcon?: boolean
}) {
  const notice = await staleSkillNotice(payload.path)
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
    if (notice) console.log(pc.yellow(notice) + '\n')
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

// The Scratchpad palette (matches the UI toolbar's six swatches) and each color's
// light-theme solid hex — used to snap an arbitrary `--color #rrggbb` to the nearest
// palette entry (tldraw shapes can't hold free hex). Keep in sync with the swatches
// in client/components/Scratchpad.tsx.
const COLOR_HEX: Record<ScratchColor, string> = {
  black: '#1d1d1d',
  red: '#e03131',
  yellow: '#f1ac4b',
  green: '#099268',
  blue: '#4465e9',
  grey: '#9fa8b2'
}
const COLOR_NAMES = Object.keys(COLOR_HEX) as ScratchColor[]

// Arrows expose tldraw's size as a line weight; the CLI mirrors the UI's two sizes.
const STROKE_SIZES: Record<string, ScratchSize> = { small: 'm', large: 'xl' }
const STROKE_NAMES = Object.keys(STROKE_SIZES)

// Text & notes expose the same size style as a label font size, under friendlier names.
const FONT_SIZES: Record<string, ScratchSize> = { regular: 'm', big: 'xl' }
const FONT_SIZE_NAMES = Object.keys(FONT_SIZES)

// Rectangle fills — the UI toolbar's four options. Each user-facing name maps onto a
// tldraw DefaultFillStyle value (see ScratchFill for tldraw's semi/solid quirk). Keep
// in sync with FILL_OPTIONS in client/components/Scratchpad.tsx.
const FILL_STYLES: Record<string, ScratchFill> = {
  none: 'none',
  semi: 'solid',
  pattern: 'pattern',
  solid: 'fill'
}
const FILL_NAMES = Object.keys(FILL_STYLES)

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Accept a palette name as-is, or snap any hex to the nearest palette color by
// squared RGB distance. Throws on anything else.
function parseColor(s: string): ScratchColor {
  const lower = s.trim().toLowerCase()
  if ((COLOR_NAMES as string[]).includes(lower)) return lower as ScratchColor
  const rgb = hexToRgb(s)
  if (!rgb) {
    throw new Error(
      `Unknown color "${s}". Use a hex like "#4465e9" or one of: ${COLOR_NAMES.join(', ')}.`
    )
  }
  let best: ScratchColor = 'black'
  let bestDist = Infinity
  for (const name of COLOR_NAMES) {
    const [r, g, b] = hexToRgb(COLOR_HEX[name])!
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}

function parseStroke(s: string): ScratchSize {
  const size = STROKE_SIZES[s.trim().toLowerCase()]
  if (!size) throw new Error(`Unknown stroke "${s}". Use one of: ${STROKE_NAMES.join(', ')}.`)
  return size
}

function parseFontSize(s: string): ScratchSize {
  const size = FONT_SIZES[s.trim().toLowerCase()]
  if (!size) throw new Error(`Unknown font size "${s}". Use one of: ${FONT_SIZE_NAMES.join(', ')}.`)
  return size
}

function parseFill(s: string): ScratchFill {
  const fill = FILL_STYLES[s.trim().toLowerCase()]
  if (!fill) throw new Error(`Unknown fill "${s}". Use one of: ${FILL_NAMES.join(', ')}.`)
  return fill
}

// Resize preset for `add image` — defaults to 'lo' (keep the canvas light).
function parseImageQuality(s: string | undefined): ScratchImageQuality {
  if (!s) return 'lo'
  const q = s.trim().toLowerCase()
  if (q === 'lo' || q === 'hi') return q
  throw new Error(`Unknown quality "${s}". Use "lo" or "hi".`)
}

// Optional styling shared across `add` commands — each command wires in only the
// controls its shape exposes (mirroring the UI's per-tool style bar).
const colorArg = {
  type: 'string',
  description: `Color: ${COLOR_NAMES.join(', ')}, or any hex (snapped to nearest)`
} as const
const strokeArg = {
  type: 'string',
  description: `Stroke weight: ${STROKE_NAMES.join(', ')}`
} as const
const fontSizeArg = {
  type: 'string',
  description: `Font size: ${FONT_SIZE_NAMES.join(', ')}`
} as const
const fillArg = {
  type: 'string',
  default: 'semi',
  description: `Fill: ${FILL_NAMES.join(', ')} (default: semi)`
} as const

// Build the optional style props from raw args. `stroke` and `fontSize` are two names
// for the same tldraw size style, so at most one is wired per command.
function styleArgs(args: {
  color?: string
  stroke?: string
  fontSize?: string
  fill?: string
}): ScratchStyle {
  return {
    ...(args.color ? { color: parseColor(args.color) } : {}),
    ...(args.stroke ? { size: parseStroke(args.stroke) } : {}),
    ...(args.fontSize ? { size: parseFontSize(args.fontSize) } : {}),
    ...(args.fill ? { fill: parseFill(args.fill) } : {})
  }
}

type ScratchCliOp = ScratchOp | { kind: 'read' } | { kind: 'read-image'; name: string }

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
    // The stale-skill notice rides on stderr so it never corrupts a command's
    // structured stdout (read's JSON, view's PNG path) while the agent still sees it.
    const notice = await staleSkillNotice(path)
    if (notice) console.error('\n' + pc.yellow(notice) + '\n')
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

// Image data URL mime → file extension, for naming the saved file.
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
}

const scratchReadImage = defineCommand({
  meta: {
    name: 'read-image',
    description: 'Save an image shape to a file by id (served off disk)'
  },
  args: {
    id: { type: 'positional', required: true, description: 'Image shape id (from `scratch read`)' },
    out: { type: 'string', description: 'Output file path (default: a temp file)' },
    dir: dirArg
  },
  async run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'read-image', name: args.id }, async res => {
      const src = res.src as string | undefined
      if (!src) {
        console.error(pc.red('No image data'))
        process.exit(1)
      }
      // A remote (http) asset has no local bytes to write — just print the URL.
      if (/^https?:\/\//.test(src)) {
        console.log(src)
        return
      }
      const m = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
      if (!m) {
        console.error(pc.red('Unrecognized image source'))
        process.exit(1)
      }
      const [, mime, base64, data] = m
      const bytes = base64
        ? Buffer.from(data, 'base64')
        : Buffer.from(decodeURIComponent(data), 'utf8')
      const ext = IMAGE_EXT[mime] ?? 'bin'
      const safeId = args.id.replace(/[^a-zA-Z0-9_-]/g, '_')
      const outPath = args.out
        ? resolve(args.out)
        : join(tmpdir(), `moi-scratch-${safeId}-${Date.now()}.${ext}`)
      await Bun.write(outPath, bytes)
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
    color: colorArg,
    fontSize: fontSizeArg,
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-text',
        name: args.id ?? '',
        x,
        y,
        text: args.text,
        ...styleArgs({ color: args.color, fontSize: args.fontSize })
      },
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
    color: colorArg,
    fill: fillArg,
    fontSize: fontSizeArg,
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
        ...(args.text ? { text: args.text } : {}),
        ...styleArgs({ color: args.color, fill: args.fill, fontSize: args.fontSize })
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
    color: colorArg,
    fontSize: fontSizeArg,
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = parseXY(args.at)
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-note',
        name: args.id ?? '',
        x,
        y,
        text: args.text,
        ...styleArgs({ color: args.color, fontSize: args.fontSize })
      },
      printAdded
    )
  }
})

const scratchAddArrow = defineCommand({
  meta: { name: 'arrow', description: 'Add an arrow connecting shapes or points' },
  args: {
    from: { type: 'string', required: true, description: 'Start: a shape name or "x,y"' },
    to: { type: 'string', required: true, description: 'End: a shape name or "x,y"' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    elbow: {
      type: 'boolean',
      description: 'Right-angle (squared) routing for diagrams; default is a curved arc'
    },
    color: colorArg,
    stroke: strokeArg,
    dir: dirArg
  },
  run({ args }) {
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-arrow',
        name: args.id ?? '',
        from: parseEnd(args.from),
        to: parseEnd(args.to),
        ...(args.elbow ? { elbow: true } : {}),
        ...styleArgs({ color: args.color, stroke: args.stroke })
      },
      printAdded
    )
  }
})

const scratchAddImage = defineCommand({
  meta: { name: 'image', description: 'Add an image from a file (resized to fit the canvas)' },
  args: {
    path: {
      type: 'positional',
      required: true,
      description: 'Path to an image file (png/jpg/webp/gif)'
    },
    at: { type: 'string', description: 'Top-left position "x,y" (default: 0,0)' },
    id: { type: 'string', description: 'Stable name to address this shape later' },
    quality: { type: 'string', description: 'Resize: lo (default, smaller) or hi (sharper)' },
    dir: dirArg
  },
  run({ args }) {
    const { x, y } = args.at ? parseXY(args.at) : { x: 0, y: 0 }
    sendScratch(
      resolve(args.dir),
      {
        kind: 'add-image',
        name: args.id ?? '',
        x,
        y,
        path: resolve(args.path),
        quality: parseImageQuality(args.quality)
      },
      printAdded
    )
  }
})

const scratchAdd = defineCommand({
  meta: { name: 'add', description: 'Add a shape: text, rect, note, arrow, or image' },
  subCommands: {
    text: scratchAddText,
    rect: scratchAddRect,
    note: scratchAddNote,
    arrow: scratchAddArrow,
    image: scratchAddImage
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

const scratchClear = defineCommand({
  meta: { name: 'clear', description: 'Delete every shape — wipe the whole canvas' },
  args: { dir: dirArg },
  run({ args }) {
    sendScratch(resolve(args.dir), { kind: 'clear' }, () =>
      console.log('\n' + pc.green('✓') + ' cleared the canvas\n')
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
    'read-image': scratchReadImage,
    view: scratchView,
    add: scratchAdd,
    move: scratchMove,
    set: scratchSet,
    delete: scratchDelete,
    clear: scratchClear
  }
})

// Re-copy bundled skills into a workspace, then report what changed. Pure
// filesystem op — no running server needed. Resolves the workspace root the
// same way `moi bundle` does, so it works from `.moi/` or any subdirectory.
async function runSkillUpdate(cwd: string): Promise<void> {
  // Type-aware: an OpenClaw workspace keeps its skills in `skills/`, so the
  // update must target the same dir the agent actually loads from.
  const { root, type } = await resolveWorkspace(cwd)
  const before = await skillStatuses(root, type)
  await installBundledSkills(skillsDirFor(root, type))
  const after = await skillStatuses(root, type)

  console.log('\n' + pc.green('✓') + ' Skills updated in ' + pc.bold(root) + '\n')
  console.log(
    columns(
      ['skill', 'from', 'to'].map(h => pc.dim(h)),
      after.map(s => {
        const prev = before.find(b => b.name === s.name)?.installed ?? null
        const changed = prev !== s.installed
        return [
          s.name,
          prev ?? pc.dim('none'),
          changed ? pc.green(s.installed ?? '?') : pc.dim((s.installed ?? '?') + ' (no change)')
        ]
      })
    )
  )
  console.log(
    '\n' +
      pc.dim(
        '  Changes apply when the skill is next loaded (new session or next skill invocation).'
      ) +
      '\n'
  )
}

// Colored status label for one skill row: minor+ behind is actionable, a patch
// gap is informational, otherwise current.
function skillState(s: SkillStatus): string {
  if (isMinorBehind(s.installed, s.bundled)) return pc.yellow('update available')
  if (isBehind(s.installed, s.bundled)) return pc.dim('patch behind')
  return pc.green('up to date')
}

// `update` and `install` are the same operation under two names (install kept
// for symmetry with how skills first land in a workspace). `dir` is a `--dir`
// option, not a positional: citty treats a bare positional on a command that
// carries subcommands as an unknown subcommand. Reuses the shared `dirArg`.
const defineSkillUpdate = (name: string, description: string) =>
  defineCommand({
    meta: { name, description },
    args: { dir: dirArg },
    async run({ args }) {
      await runSkillUpdate(resolve(args.dir))
    }
  })

const skillSubCommands = {
  update: defineSkillUpdate(
    'update',
    'Update this workspace’s skills to the version shipped with the CLI'
  ),
  install: defineSkillUpdate('install', 'Alias for `moi skill update`')
}

const skill = defineCommand({
  meta: { name: 'skill', description: 'Show or update the workspace skills shipped with moi' },
  subCommands: skillSubCommands,
  args: { dir: dirArg },
  async run({ args, rawArgs }) {
    // citty runs this parent handler even after dispatching a subcommand, so
    // bail when one was given — otherwise `moi skill update` also prints status.
    const sub = rawArgs.find(a => !a.startsWith('-'))
    if (sub && sub in skillSubCommands) return

    const { root, type } = await resolveWorkspace(resolve(args.dir))
    const statuses = await skillStatuses(root, type)

    console.log('\n' + pc.bold('moi skill') + pc.dim(' — workspace skills') + '\n')
    console.log(
      columns(
        ['skill', 'installed', 'bundled', 'status'].map(h => pc.dim(h)),
        statuses.map(s => [
          s.name,
          s.installed ?? pc.dim('—'),
          s.bundled ?? pc.dim('—'),
          skillState(s)
        ])
      )
    )
    if (statuses.some(s => isBehind(s.installed, s.bundled))) {
      console.log('\n' + pc.dim('  Run ') + pc.bold('moi skill update') + pc.dim(' to refresh.'))
    }
    console.log()
  }
})

// `<package version> (<8-char commit>)`, e.g. `0.1.3 (27e17e80)`. The commit is
// read from git at call time, so it appears for a source/`bun link` checkout and
// is simply omitted for a published package (which ships no .git).
function moiVersion(): string {
  const root = join(import.meta.dir, '..')
  let version = '0.0.0'
  try {
    version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string })
      .version
  } catch {}
  let commit = ''
  try {
    const out = Bun.spawnSync(['git', 'rev-parse', '--short=8', 'HEAD'], { cwd: root })
    if (out.success) commit = out.stdout.toString().trim()
  } catch {}
  return commit ? `${version} (${commit})` : version
}

const version = defineCommand({
  meta: { name: 'version', description: 'Print the moi version' },
  run() {
    console.log(moiVersion())
  }
})

const main = defineCommand({
  // A function so the git lookup runs only for `moi --version` / `--help`, not on
  // every command. citty resolves a function meta (used for --version + usage).
  meta: () => ({ name: 'moi', description: 'moi — local AI workspace', version: moiVersion() }),
  subCommands: {
    init,
    start,
    bundle,
    refresh,
    theme,
    config,
    env,
    status,
    openclaw,
    scratch,
    skill,
    version
  }
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
