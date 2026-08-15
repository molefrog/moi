// Shared `moi update` mechanics for the CLI and the local web UI: check the npm
// registry, find the package manager that owns the current global install, and
// update through it so no second shadowing install appears. Checks may run in
// the background; installing always requires an explicit user action.
import { realpathSync } from 'node:fs'

import type { SessionActivity, UpdateResult, UpdateStatus } from '@/lib/types'

import { analyzeInstall } from './service'
import type { InstallAnalysis } from './service'
import { PACKAGE_ROOT, VERSION, isPrerelease } from './version'

export const PACKAGE_NAME = 'moi-computer'
export const UPDATE_RESTART_EXIT_CODE = 75

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

type ServerProcess = {
  exited: Promise<number>
}

// A service manager already respawns failed exits. Foreground launchers use
// the same exit code to replace their server child with the updated install.
export async function superviseServerUpdates(
  child: ServerProcess,
  respawn: () => ServerProcess
): Promise<number> {
  let exitCode = await child.exited
  while (exitCode === UPDATE_RESTART_EXIT_CODE) {
    child = respawn()
    exitCode = await child.exited
  }
  return exitCode
}

type UpdateOptions = {
  runningVersion?: string
  analysis?: InstallAnalysis
  fetchLatest?: () => Promise<string>
  detectManager?: () => Promise<PackageManager | null>
  runManager?: (argv: string[]) => Promise<number>
  readInstalledVersion?: (bin: string) => Promise<string | null>
}

type AvailableUpdate = {
  version: string
  packageManager: PackageManager
  bin: string
}

export function hasRunningAgentSessions(sessions: { activity: SessionActivity }[]): boolean {
  return sessions.some(session => session.activity === 'running')
}

async function findAvailableUpdate(options: UpdateOptions): Promise<AvailableUpdate | null> {
  const runningVersion = options.runningVersion ?? VERSION
  const analysis = options.analysis ?? analyzeInstall()
  if (analysis.kind !== 'global' || isPrerelease(runningVersion)) return null
  const version = await (options.fetchLatest ?? fetchLatestVersion)()
  if (!isNewer(version, runningVersion)) return null
  const packageManager = await (options.detectManager ?? detectPackageManager)()
  return packageManager ? { version, packageManager, bin: analysis.bin } : null
}

// Background checks stay quiet. The UI only needs the running version and an
// actionable newer version, if one can be installed safely.
export async function getUpdateStatus(options: UpdateOptions = {}): Promise<UpdateStatus> {
  const runningVersion = options.runningVersion ?? VERSION
  try {
    const update = await findAvailableUpdate(options)
    return { runningVersion, availableVersion: update?.version ?? null }
  } catch {
    return { runningVersion, availableVersion: null }
  }
}

async function performUpdate(options: UpdateOptions): Promise<UpdateResult | null> {
  const update = await findAvailableUpdate(options)
  if (!update) return null

  const argv = updateArgv(update.packageManager, update.version)
  const exitCode = await (options.runManager ?? runPackageManager)(argv)
  if (exitCode !== 0) {
    throw new Error(
      `${update.packageManager} exited with code ${exitCode}. Run \`moi update\` in a terminal for details.`
    )
  }
  const installedVersion = await (options.readInstalledVersion ?? installedBinVersion)(update.bin)
  if (installedVersion !== update.version) {
    const detail = installedVersion
      ? `The moi command reports v${installedVersion} instead of v${update.version}.`
      : 'Could not verify the updated moi command.'
    throw new Error(`${detail} Run \`moi update\` in a terminal for details.`)
  }
  return { installedVersion }
}

// Multiple open browser tabs share one install. They also share this promise,
// so two clicks never launch two global package-manager processes. A successful
// result stays cached for the few milliseconds until the server restarts.
let installInFlight: Promise<UpdateResult | null> | null = null

export function installUpdate(options: UpdateOptions = {}): Promise<UpdateResult | null> {
  installInFlight ??= performUpdate(options).then(
    result => {
      if (!result) installInFlight = null
      return result
    },
    error => {
      installInFlight = null
      throw error
    }
  )
  return installInFlight
}

export function __resetUpdateStateForTests(): void {
  installInFlight = null
}
