import { userInfo } from 'node:os'
import { delimiter } from 'node:path'

// The moi server does not always start from a terminal (GUI launcher, service
// manager), and a non-shell parent's PATH misses exactly the dirs agent CLIs
// install to: ~/.local/bin, ~/.bun/bin, homebrew, version-manager shims. Probe
// the user's login shell for its PATH and merge it into every executable
// lookup — the same recovery VS Code and Superset use, minus the PTY.

const MARKER = '__moi_env__'
const TIMEOUT_MS = 3000

function configuredShell(): string | undefined {
  if (process.platform === 'win32') return undefined
  try {
    const shell = userInfo().shell
    if (shell) return shell
  } catch {
    // userInfo() throws when the account has no passwd entry (containers).
  }
  return process.env.SHELL || undefined
}

// `/usr/bin/env` instead of `echo $PATH`: fish joins list variables with
// spaces, and rc files are free to print noise — the markers isolate env's
// output so only the real PATH line is parsed.
async function detectLoginShellPath(): Promise<string | undefined> {
  const shell = configuredShell()
  if (!shell) return undefined
  const proc = Bun.spawn(
    [shell, '-l', '-c', `printf '%s' '${MARKER}'; /usr/bin/env; printf '%s' '${MARKER}'`],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'ignore' }
  )
  const timeout = setTimeout(() => proc.kill(), TIMEOUT_MS)
  try {
    const [out] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    const start = out.indexOf(MARKER)
    const end = out.lastIndexOf(MARKER)
    if (start === -1 || end <= start) return undefined
    const env = out.slice(start + MARKER.length, end)
    for (const line of env.split('\n')) {
      if (line.startsWith('PATH=')) return line.slice('PATH='.length) || undefined
    }
    return undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

let cached: { path: string | undefined } | undefined
let pending: Promise<string | undefined> | undefined

// Start (or join) the login-shell PATH probe. Failure is not an error —
// lookups just fall back to the server's own PATH.
export function loginShellPath({ refresh = false }: { refresh?: boolean } = {}): Promise<
  string | undefined
> {
  if (pending) return pending
  if (cached && !refresh) return Promise.resolve(cached.path)
  pending = detectLoginShellPath()
    .catch(() => undefined)
    .then(path => {
      cached = { path }
      return path
    })
    .finally(() => {
      pending = undefined
    })
  return pending
}

// Last resolved value, for sync callers on the spawn path. Undefined until the
// probe settles; executable.ts kicks it off at module load, so real spawns
// (always later than server start) see the resolved value.
export function cachedLoginShellPath(): string | undefined {
  return cached?.path
}

export function mergeSearchPaths(...paths: Array<string | undefined>): string {
  const seen = new Set<string>()
  for (const path of paths) {
    for (const dir of (path ?? '').split(delimiter)) {
      if (dir) seen.add(dir)
    }
  }
  return [...seen].join(delimiter)
}
