// CLI face over the workspace env model (workspace-env.ts): rendering for
// `moi env`, secret-value input for `moi env set`, and the exec spawn. Every
// read and write goes to the running server over the control port.
//
// Secret VALUES never pass through here except on their way to the server
// (`set` reads stdin/argv) or into a spawned process (`execWithEnv`). Nothing
// in this module prints a value.
import type { WorkspaceEntry, WorkspaceEnvView } from '@/lib/types'

import pc from './cli-pc'
import { columns } from './cli-ui'
import { CONTROL_URL } from './constants'
import { controlFailureMessage, probeControlServer } from './control-client'
import { findWorkspaceForPath } from './registry'
import { type EnvUpdate, discoverDotenvKeys } from './workspace-env'

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

// The server owns the registry and the env stores: it applies a write at once
// and queues writes per workspace, so the CLI never touches the files itself.
// That is also the only way in for the agent on a managed machine, whose OS
// user can't open moi's data folder (docs/config.md).

function serverFail(message: string): never {
  console.error('\n' + pc.red('✗') + ' ' + message + '\n')
  process.exit(1)
}

// One control-port request and its reply. Exits with the server's error, or
// with why it couldn't be reached, like the other workspace commands.
function askServer(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const unreachable = () =>
    void probeControlServer().then(p => serverFail(controlFailureMessage(p)))
  return new Promise(resolve => {
    let ws: WebSocket
    try {
      ws = new WebSocket(CONTROL_URL)
    } catch {
      unreachable()
      return
    }
    ws.onopen = () => ws.send(JSON.stringify(payload))
    ws.onmessage = event => {
      ws.close()
      let res: Record<string, unknown>
      try {
        res = JSON.parse(String(event.data))
      } catch {
        serverFail('Unexpected reply from moi')
      }
      if (typeof res.error === 'string') serverFail(res.error)
      resolve(res)
    }
    ws.onerror = unreachable
  })
}

// ---------------------------------------------------------------------------
// Workspace resolution: cwd → nearest registered workspace
// ---------------------------------------------------------------------------

// Every `moi env` subcommand targets the workspace containing cwd (same
// semantics as the control server's resolveWorkspace — works from `.moi/` or
// any subdirectory). Exits with a hint when cwd is outside every workspace, so
// a typo never creates an orphan env entry keyed to a phantom path.
export async function resolveCwdWorkspace(): Promise<WorkspaceEntry> {
  const { workspaces } = await askServer({ type: 'workspace:list' })
  const match = findWorkspaceForPath(workspaces as WorkspaceEntry[], process.cwd())
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
// Reading and writing the env
// ---------------------------------------------------------------------------

// The workspace env as `moi env` shows it (key names, never values), with the
// keys its widgets and views require.
export async function readEnvView(path: string): Promise<WorkspaceEnvView> {
  return (await askServer({ type: 'env:view', path })).view as WorkspaceEnvView
}

// Apply an env patch; the server makes it take effect at once. Returns where
// the secrets are stored, for the plaintext-fallback notice.
export async function writeEnv(path: string, patch: EnvUpdate): Promise<'keychain' | 'file'> {
  const res = await askServer({ type: 'env:update', path, patch })
  return res.backend === 'file' ? 'file' : 'keychain'
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
    const width = Math.max(...view.files.map(f => f.file.length))
    for (const f of view.files) {
      out.push(
        `  ${f.file.padEnd(width)}  ${pc.dim(`${f.count} ${f.count === 1 ? 'key' : 'keys'}`)}`
      )
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
    const width = Math.max(...view.required.map(r => r.key.length))
    for (const r of view.required) {
      const mark = r.satisfied ? pc.green('✓') : pc.red('✗')
      const who = r.widgets.join(', ')
      lines.push(
        r.satisfied
          ? `  ${mark} ${r.key.padEnd(width)}  ${pc.dim(who)}`
          : `  ${mark} ${r.key.padEnd(width)}  missing — required by ${who}`
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
// `moi env exec`
// ---------------------------------------------------------------------------

// Run `cmd` with the workspace env overlaid on the inherited process env — the
// workspace resolution wins, so re-resolved values override a stale agent-
// session snapshot. Returns the child's exit code; 127 when the binary is
// missing.
export async function execWithEnv(workspacePath: string, cmd: string[]): Promise<number> {
  const [resolved, dotenvKeys] = await Promise.all([
    askServer({ type: 'env:resolve', path: workspacePath }).then(
      res => res.env as Record<string, string>
    ),
    discoverDotenvKeys(workspacePath)
  ])
  // Bun auto-loads the workspace `.env` into THIS process when the CLI runs
  // from the workspace root, so the inherited env is not trustworthy for
  // workspace keys — scrub them and let the resolution re-add what actually
  // applies (otherwise `inheritDotenv: off` still leaks `.env` values).
  const base: Record<string, string | undefined> = { ...process.env }
  for (const key of dotenvKeys) delete base[key]
  const env = { ...base, ...resolved }
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
