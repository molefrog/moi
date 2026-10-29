import { join } from 'path'
import { PACKAGE_ROOT } from '../version'
import pc from './pc'

// Spawn the server as a child. MOI_SERVER=1 tells the child it is the actual
// server process. No `--hot`: frontend HMR comes from Bun.serve's dev bundler,
// and server reloads are a full process restart driven by the dev supervisor
// (see runDevSupervisor).
export function spawnServer(
  cwd: string,
  env: Record<string, string | undefined> = process.env,
  experimentalFlags: string[] = []
): ReturnType<typeof Bun.spawn> {
  // Keep the runtime checked by the launcher; resolving `bun` on PATH again
  // can select an older installation for the child (and every restart).
  const argv = [
    process.execPath,
    join(PACKAGE_ROOT, 'server', 'cli.ts'),
    'start',
    ...experimentalFlags
  ]
  return Bun.spawn(argv, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    cwd,
    env: {
      ...env,
      MOI_SERVER: '1'
    }
  })
}

// Dev supervisor: run the server as a child WITHOUT `bun --hot`, watch the
// server-side source (`server/`, `lib/`) and full-restart the child on change.
// Client files are intentionally not watched here — Bun.serve owns frontend HMR
// and patches the browser in place. The child shuts down gracefully on SIGTERM
// (closing servers + killing function workers), so restarts leak nothing.
export async function runDevSupervisor(
  projectRoot: string,
  env: Record<string, string | undefined>,
  experimentalFlags: string[]
): Promise<void> {
  const { watch } = await import('node:fs')

  let child = spawnServer(projectRoot, env, experimentalFlags)
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
    child = spawnServer(projectRoot, env, experimentalFlags)
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
