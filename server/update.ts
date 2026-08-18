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

// Both of these describe where this process was installed from, which cannot
// change while it runs — and `detectPackageManager` may spawn `npm root -g`, a
// whole Node process. Probe each once and reuse the answer for every later
// check; the promise (not the value) is memoized so concurrent callers share
// the one probe. `null` is a real answer here — an install nobody owns stays
// unowned — so it is cached like any other.
let installAnalysis: InstallAnalysis | null = null
let managerProbe: Promise<PackageManager | null> | null = null

export function ownInstall(): InstallAnalysis {
  return (installAnalysis ??= analyzeInstall())
}

export function owningManager(): Promise<PackageManager | null> {
  return (managerProbe ??= detectPackageManager())
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
  const analysis = options.analysis ?? ownInstall()
  if (analysis.kind !== 'global' || isPrerelease(runningVersion)) return null
  const version = await (options.fetchLatest ?? fetchLatestVersion)()
  if (!isNewer(version, runningVersion)) return null
  const packageManager = await (options.detectManager ?? owningManager)()
  return packageManager ? { version, packageManager, bin: analysis.bin } : null
}

// Background checks stay quiet: every failure reads to the UI as "nothing to
// install". The cache still needs to tell the two apart — an unreachable
// registry should be retried in minutes, a successful "you are current" in
// hours — so the outcome carries `ok` alongside the status the UI sees.
type CheckOutcome = { ok: boolean; status: UpdateStatus }

async function checkForUpdate(options: UpdateOptions): Promise<CheckOutcome> {
  const runningVersion = options.runningVersion ?? VERSION
  try {
    const update = await findAvailableUpdate(options)
    return { ok: true, status: { runningVersion, availableVersion: update?.version ?? null } }
  } catch {
    return { ok: false, status: { runningVersion, availableVersion: null } }
  }
}

// One uncached check. The cached path below is what the API serves.
export async function getUpdateStatus(options: UpdateOptions = {}): Promise<UpdateStatus> {
  return (await checkForUpdate(options)).status
}

// ---- cached status ----------------------------------------------------------

// There is deliberately no background timer. The check runs when a client asks
// and the cached answer has aged out, which means: a closed app makes no
// network calls at all, the cost stays flat no matter how many tabs or reloads
// there are, and a machine waking from sleep does exactly one check on the next
// poll instead of firing into a network stack that is not up yet.
export type UpdateTimings = {
  // Nothing is checked this early into the process — one grace window per
  // server boot, not per tab, so a burst of reloads cannot compound it.
  bootGraceMs: number
  // How long a successful answer is served before it is refreshed.
  cacheTtlMs: number
  // How long a *failed* check is remembered. Without this the client's poll
  // interval becomes the retry interval and an offline machine hammers the
  // registry all day.
  failureBackoffMs: number
}

export const UPDATE_BOOT_GRACE_MS = 60_000
export const UPDATE_CACHE_TTL_MS = 60 * 60 * 1000
export const UPDATE_FAILURE_BACKOFF_MS = 5 * 60 * 1000

// Test seams (`MOI_UPDATE_*_MS`): the e2e drives real HTTP against a spawned
// server, so it needs these compressed to milliseconds.
function envMs(name: string, fallback: number): number {
  const raw = Number(process.env[name])
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

function defaultTimings(): UpdateTimings {
  return {
    bootGraceMs: envMs('MOI_UPDATE_BOOT_GRACE_MS', UPDATE_BOOT_GRACE_MS),
    cacheTtlMs: envMs('MOI_UPDATE_CACHE_TTL_MS', UPDATE_CACHE_TTL_MS),
    failureBackoffMs: envMs('MOI_UPDATE_FAILURE_BACKOFF_MS', UPDATE_FAILURE_BACKOFF_MS)
  }
}

type StatusCache = {
  status: UpdateStatus
  attemptedAt: number
  ok: boolean
}

type CachedStatusOptions = UpdateOptions & {
  now?: () => number
  uptimeMs?: () => number
  timings?: Partial<UpdateTimings>
}

let statusCache: StatusCache | null = null
let statusInFlight: Promise<UpdateStatus> | null = null

// Wall-clock deltas only ever widen an interval here. A clock that jumped
// backwards (an NTP correction after sleep is the usual cause) would otherwise
// read as "checked in the future" and pin the cache forever, so treat it as
// infinitely old: the cost of being wrong is one extra check.
function elapsed(since: number, now: number): number {
  return now >= since ? now - since : Number.POSITIVE_INFINITY
}

function needsRefresh(
  cache: StatusCache | null,
  now: number,
  uptime: number,
  timings: UpdateTimings
): boolean {
  if (uptime < timings.bootGraceMs) return false
  if (!cache) return true
  const age = elapsed(cache.attemptedAt, now)
  return age >= (cache.ok ? timings.cacheTtlMs : timings.failureBackoffMs)
}

// What `GET /api/update` serves: the cached answer, refreshed lazily. Callers
// that arrive together share one refresh, so N tabs crossing the TTL boundary
// at the same moment produce one registry request, not N.
export async function getCachedUpdateStatus(
  options: CachedStatusOptions = {}
): Promise<UpdateStatus> {
  const now = (options.now ?? Date.now)()
  const uptime = (options.uptimeMs ?? defaultUptimeMs)()
  const timings = { ...defaultTimings(), ...options.timings }

  if (!needsRefresh(statusCache, now, uptime, timings)) {
    return (
      statusCache?.status ?? {
        runningVersion: options.runningVersion ?? VERSION,
        availableVersion: null
      }
    )
  }

  statusInFlight ??= checkForUpdate(options)
    .then(outcome => {
      statusCache = { status: outcome.status, attemptedAt: now, ok: outcome.ok }
      return outcome.status
    })
    .finally(() => {
      statusInFlight = null
    })
  return statusInFlight
}

function defaultUptimeMs(): number {
  return process.uptime() * 1000
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
//
// This guards this process only. A `moi update` run in a terminal while the UI
// installs is still two package managers writing one global tree; that needs a
// lock file both entry points take, which is not here yet.
let installInFlight: Promise<UpdateResult | null> | null = null

// Lets the API answer a second click with "already in progress" instead of
// silently reporting someone else's install as its own. Stays true once an
// install succeeds — the restart it scheduled has not landed yet, and
// `restartPendingForUpdate` tells those two states apart.
export function updateInProgress(): boolean {
  return installInFlight !== null
}

export function installUpdate(options: UpdateOptions = {}): Promise<UpdateResult | null> {
  installInFlight ??= performUpdate(options).then(
    result => {
      if (!result) installInFlight = null
      // The install just invalidated whatever the cache says is available.
      else statusCache = null
      return result
    },
    error => {
      installInFlight = null
      throw error
    }
  )
  return installInFlight
}

// ---- restart ----------------------------------------------------------------

// Long enough for the HTTP response that triggered it to be flushed to the
// browser that clicked — it is that response the client waits on before it
// starts polling for the restarted server.
export const UPDATE_RESTART_DELAY_MS = 500

let restartScheduled = false

export function restartPendingForUpdate(): boolean {
  return restartScheduled
}

// Hand the process back to whoever supervises it: the foreground CLI
// (`superviseServerUpdates`) and service managers alike bring it back on a
// non-zero exit, and 75 is the code they agree means "updated, come back".
// Latched, so concurrent callers schedule one SIGTERM rather than one each.
export function scheduleRestartForUpdate(delayMs = UPDATE_RESTART_DELAY_MS): boolean {
  if (restartScheduled) return false
  restartScheduled = true
  const timer = setTimeout(() => {
    process.exitCode = UPDATE_RESTART_EXIT_CODE
    process.kill(process.pid, 'SIGTERM')
  }, delayMs)
  timer.unref()
  return true
}

export function __resetUpdateStateForTests(): void {
  installInFlight = null
  statusCache = null
  statusInFlight = null
  installAnalysis = null
  managerProbe = null
  restartScheduled = false
}
