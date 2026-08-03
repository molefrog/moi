// `moi update` mechanics: check the npm registry for the latest published
// version, find the package manager that owns the current global install, and
// update through it — never around it, so no second shadowing install appears.
// Manual command only; nothing here runs in the background.
import { realpathSync } from 'node:fs'

import { PACKAGE_ROOT } from './version'

export const PACKAGE_NAME = 'moi-computer'

// Test seam: point at a local mock registry (`MOI_NPM_REGISTRY`).
function registryBase(): string {
  return (process.env.MOI_NPM_REGISTRY || 'https://registry.npmjs.org').replace(/\/$/, '')
}

// Resolve the `latest` dist-tag. Throws with a friendly message on network or
// registry trouble — the CLI shows it verbatim.
export async function fetchLatestVersion(pkg = PACKAGE_NAME): Promise<string> {
  const url = `${registryBase()}/${pkg}/latest`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new Error(`Could not reach the npm registry (${registryBase()}) — check your network.`)
  }
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${pkg} — try again later.`)
  }
  const data = (await res.json().catch(() => null)) as { version?: unknown } | null
  if (!data || typeof data.version !== 'string') {
    throw new Error('Unexpected npm registry response — try again later.')
  }
  return data.version
}

// `Bun.semver.order` handles prerelease precedence correctly
// (0.5.2-next.1 < 0.5.2).
export function isNewer(candidate: string, current: string): boolean {
  try {
    return Bun.semver.order(candidate, current) === 1
  } catch {
    return false
  }
}

// ---- owning package manager -------------------------------------------------

export type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn'

// Where each manager keeps its global tree leaves a recognizable path
// signature; npm's prefix is freeform, so it gets confirmed by asking npm
// itself (only when nothing else matched — `npm root -g` costs a process).
export async function detectPackageManager(
  installRoot: string = safeRealpath(PACKAGE_ROOT),
  npmRootDir: () => Promise<string | null> = defaultNpmRootDir
): Promise<PackageManager | null> {
  const root = installRoot.replaceAll('\\', '/')
  if (root.includes('/.bun/')) return 'bun'
  if (root.includes('/.pnpm/') || root.includes('/pnpm/')) return 'pnpm'
  if (root.includes('/.yarn/') || root.includes('/yarn/')) return 'yarn'
  const npmRoot = await npmRootDir()
  if (npmRoot && root.startsWith(npmRoot.replaceAll('\\', '/').replace(/\/$/, '') + '/')) {
    return 'npm'
  }
  return null
}

function safeRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

async function defaultNpmRootDir(): Promise<string | null> {
  try {
    const proc = Bun.spawn(['npm', 'root', '-g'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore'
    })
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    if (code !== 0) return null
    const dir = out.trim()
    return dir ? safeRealpath(dir) : null
  } catch {
    return null
  }
}

// The exact global-install command per manager, pinned to the resolved version
// so the install matches what the check reported.
export function updateArgv(pm: PackageManager, version: string): string[] {
  const spec = `${PACKAGE_NAME}@${version}`
  switch (pm) {
    case 'bun':
      return ['bun', 'install', '-g', spec]
    case 'npm':
      return ['npm', 'install', '-g', spec]
    case 'pnpm':
      return ['pnpm', 'add', '-g', spec]
    case 'yarn':
      return ['yarn', 'global', 'add', spec]
  }
}

// One manual line per manager, for when detection comes up empty.
export function manualUpdateLines(version: string): string[] {
  return (['bun', 'npm', 'pnpm', 'yarn'] as const).map(pm => updateArgv(pm, version).join(' '))
}

// Run the owning package manager with live output (the user watches their own
// tool do the work). Returns the exit code.
export async function runPackageManager(argv: string[]): Promise<number> {
  try {
    const proc = Bun.spawn(argv, { stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' })
    return await proc.exited
  } catch {
    return 127
  }
}

// Ask the freshly-updated install what version it is now, through the same bin
// users run — catching both a failed install and a PATH that resolves to some
// other, shadowing install.
export async function installedBinVersion(bin: string): Promise<string | null> {
  try {
    const proc = Bun.spawn([bin, 'version'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore'
    })
    const [code, out] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    if (code !== 0) return null
    const m = out.trim().match(/^(\S+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}
