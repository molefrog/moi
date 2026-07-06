// CLI face over the workspace env model (workspace-env.ts): rendering for
// `moi env`, secret-value input for `moi env set`, the exec spawn, and the
// control-port notification that lets a running server pick up CLI writes.
//
// Secret VALUES never pass through here except on their way into a spawned
// process (`execWithEnv`) or the secret store (`set` reads stdin/argv). Nothing
// in this module prints a value.
import pc from 'picocolors'

import type { WorkspaceEntry, WorkspaceEnvView } from '@/lib/types'

import { columns } from './cli-ui'
import { CONTROL_PORT } from './constants'
import { findWorkspaceForPath, listWorkspaces } from './registry'
import { resolveWorkspaceEnv } from './workspace-env'

// ---------------------------------------------------------------------------
// Workspace resolution: cwd → nearest registered workspace
// ---------------------------------------------------------------------------

// Every `moi env` subcommand targets the workspace containing cwd (same
// semantics as the control server's resolveWorkspace — works from `.moi/` or
// any subdirectory). Exits with a hint when cwd is outside every workspace, so
// a typo never creates an orphan env entry keyed to a phantom path.
export async function resolveCwdWorkspace(): Promise<WorkspaceEntry> {
  const match = findWorkspaceForPath(await listWorkspaces(), process.cwd())
  if (!match) {
    console.error(
      '\n' +
        pc.red('✗') +
        ` ${process.cwd()} is not inside a registered moi workspace.\n` +
        pc.dim('  Open it in moi, or run from the workspace root.\n')
    )
    process.exit(1)
  }
  return match
}

// ---------------------------------------------------------------------------
// `moi env` rendering
// ---------------------------------------------------------------------------

function renderDotenvSection(view: WorkspaceEnvView): string[] {
  const out: string[] = []
  const state = view.inheritDotenv
    ? pc.dim('inherited: on')
    : pc.yellow('inherited: off') + pc.dim(' (disabled in settings — keys not injected)')
  out.push(`${pc.bold('.env files')}   ${state}`)
  if (view.files.length === 0) {
    out.push(pc.dim('  none detected'))
  } else {
    for (const f of view.files) {
      out.push(`  ${f.file.padEnd(12)} ${pc.dim(`${f.count} ${f.count === 1 ? 'key' : 'keys'}`)}`)
    }
  }
  return out
}

function sourceLabel(v: WorkspaceEnvView['vars'][number]): string {
  // A dotenv-sourced key names its file(s); `both` is a custom secret shadowing
  // a `.env` value (custom wins).
  if (v.source === 'custom') return 'custom'
  const files = (v.files ?? []).join(', ')
  return v.source === 'both' ? `custom ${pc.dim(`(overrides ${files})`)}` : files
}

// The full diagnostic view: vars with sources, dotenv state (files listed even
// when disabled), required-key satisfaction, and the secret backend. No values.
export function renderEnvView(entry: WorkspaceEntry, view: WorkspaceEnvView): string {
  const lines: string[] = []
  const name = entry.name ? `  (${entry.name})` : ''
  lines.push(`${pc.bold('Workspace:')} ${entry.displayPath ?? entry.path}${pc.dim(name)}`)
  lines.push('')
  lines.push(...renderDotenvSection(view))
  lines.push('')

  if (view.vars.length === 0) {
    lines.push(pc.dim('No env vars — add secrets in the workspace env settings, or create a .env.'))
  } else {
    lines.push(
      columns(
        ['KEY', 'SOURCE'].map(h => pc.dim(h)),
        view.vars.map(v => [v.key, sourceLabel(v)]),
        ''
      )
    )
  }

  if (view.required.length > 0) {
    lines.push('')
    lines.push(pc.bold('Required by widgets/views'))
    for (const r of view.required) {
      const mark = r.satisfied ? pc.green('✓') : pc.red('✗')
      const who = r.widgets.join(', ')
      lines.push(
        r.satisfied
          ? `  ${mark} ${r.key.padEnd(20)} ${pc.dim(who)}`
          : `  ${mark} ${r.key.padEnd(20)} missing — required by ${who}`
      )
    }
  }

  lines.push('')
  lines.push(
    pc.dim(`Secrets stored in: ${view.backend === 'keychain' ? 'OS keychain' : 'file (0600)'}`)
  )
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// `moi env set` value input
// ---------------------------------------------------------------------------

// Read a secret from a TTY without echoing: raw mode, chars collected until
// Enter, backspace honored, Ctrl-C aborts. The prompt goes to stderr so even a
// redirected stdout captures no trace of the interaction.
function readSecretFromTty(promptText: string): Promise<string> {
  process.stderr.write(promptText)
  const stdin = process.stdin
  stdin.setRawMode(true)
  stdin.resume()
  let value = ''
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      process.stderr.write('\n')
    }
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          cleanup()
          resolve(value)
          return
        }
        if (ch === '\u0003') {
          cleanup()
          reject(new Error('Aborted'))
          return
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

// The value for a bare `moi env set KEY`: hidden TTY prompt for humans, piped
// stdin for scripts (one trailing newline trimmed, so `echo $V | moi env set K`
// stores exactly $V).
export async function readSecretValue(key: string): Promise<string> {
  if (process.stdin.isTTY) return readSecretFromTty(`Value for ${key} (hidden): `)
  return (await Bun.stdin.text()).replace(/\r?\n$/, '')
}

// ---------------------------------------------------------------------------
// Server notification after a CLI write
// ---------------------------------------------------------------------------

// Env is frozen at spawn — a running server must reap the widget worker and
// idle agent sessions for a CLI write to take effect (mirrors PUT /env). Sends
// `env:changed` over the control port; resolves false when no server is
// running (fine: the next server start resolves fresh env anyway).
export function notifyEnvChanged(path: string): Promise<boolean> {
  return new Promise(resolve => {
    let ws: WebSocket
    try {
      ws = new WebSocket(`ws://localhost:${CONTROL_PORT}`)
    } catch {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      resolve(false)
    }, 1500)
    ws.onopen = () => ws.send(JSON.stringify({ type: 'env:changed', path }))
    ws.onmessage = event => {
      clearTimeout(timer)
      ws.close()
      const res = JSON.parse(String(event.data))
      resolve(res.ok === true)
    }
    ws.onerror = () => {
      clearTimeout(timer)
      resolve(false)
    }
  })
}

// ---------------------------------------------------------------------------
// `moi env exec`
// ---------------------------------------------------------------------------

// Run `cmd` with the workspace env overlaid on the inherited process env — the
// workspace resolution wins, so re-resolved values override a stale agent-
// session snapshot. Returns the child's exit code; 127 when the binary is
// missing.
export async function execWithEnv(workspacePath: string, cmd: string[]): Promise<number> {
  const env = { ...process.env, ...(await resolveWorkspaceEnv(workspacePath)) }
  try {
    const proc = Bun.spawn(cmd, {
      cwd: process.cwd(),
      env,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit'
    })
    return await proc.exited
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(pc.red('✗') + ` Could not run ${cmd[0]}: ${msg}`)
    return 127
  }
}
