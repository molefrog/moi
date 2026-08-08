// Standalone install management behind `moi update` and `moi uninstall` for the
// self-contained distribution (see packaging/install.sh and
// scripts/build-standalone.ts).
//
// A standalone install lives under MOI_STANDALONE_HOME (default ~/.moi):
//
//   $MOI_HOME/bin/moi              exec shim on PATH (never changes)
//   $MOI_HOME/runtime/current  ->  <version>   (symlink, flipped atomically)
//   $MOI_HOME/runtime/<version>/{bun, app/...}
//
// The shim sets MOI_STANDALONE_HOME before exec'ing the pinned bun, which is
// how these commands know they're allowed to manage the tree. Under npm
// installs the env var is absent and both commands defer to the package
// manager instead.
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, readFile, readdir, readlink, rename, rm, stat, symlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { defineCommand } from 'citty'

import pc from './cli-pc'
import { VERSION } from './version'

const REPO = 'molefrog/moi'
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000
const LOCK_WAIT_MS = 60_000

function existingRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export function resolveStandaloneHome(raw: string): string {
  if (!isAbsolute(raw)) throw new Error('The standalone moi home must be an absolute path')

  const home = existingRealpath(resolve(raw))
  const root = parse(home).root
  const userHome = existingRealpath(resolve(homedir()))
  if (home === root || home === userHome) {
    throw new Error(`Refusing to use unsafe standalone moi home: ${home}`)
  }
  return home
}

function safeRemovalPath(raw: string, label: string): string {
  if (!isAbsolute(raw)) throw new Error(`Refusing to remove relative ${label} path: ${raw}`)

  const path = existingRealpath(resolve(raw))
  const root = parse(path).root
  const userHome = existingRealpath(resolve(homedir()))
  if (path === root || path === userHome) {
    throw new Error(`Refusing to remove unsafe ${label} path: ${path}`)
  }
  return path
}

function standaloneHome(): string | null {
  const raw = process.env.MOI_STANDALONE_HOME
  return raw ? resolveStandaloneHome(raw) : null
}

export function isStandaloneInstall(): boolean {
  return Boolean(process.env.MOI_STANDALONE_HOME)
}

// Release asset platform suffix, e.g. `darwin-arm64`. Matches the names
// scripts/build-standalone.ts produces.
function currentPlatform(): string {
  return `${process.platform}-${process.arch}`
}

async function activeInstalledVersion(runtimeDir: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(
      await readFile(join(runtimeDir, 'current', 'app', 'package.json'), 'utf8')
    ) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

type ReleaseAsset = { name: string; browser_download_url: string }
type Release = { tag_name: string; assets: ReleaseAsset[] }

function githubApiBase(): string {
  return (process.env.MOI_GITHUB_API || 'https://api.github.com').replace(/\/$/, '')
}

// Only exact stable semver tags are installable. This rejects prereleases,
// build metadata, shortened versions, and arbitrary release names before any
// value reaches a filesystem path.
export function stableVersionFromTag(tag: string): string | null {
  const match = /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag)
  return match?.[1] ?? null
}

export function compareStableVersions(left: string, right: string): -1 | 0 | 1 {
  const stableLeft = stableVersionFromTag(left)
  const stableRight = stableVersionFromTag(right)
  if (!stableLeft || !stableRight)
    throw new Error(`Cannot compare invalid versions: ${left}, ${right}`)

  const leftParts = stableLeft.split('.').map(BigInt)
  const rightParts = stableRight.split('.').map(BigInt)
  for (let index = 0; index < leftParts.length; index++) {
    if (leftParts[index] < rightParts[index]) return -1
    if (leftParts[index] > rightParts[index]) return 1
  }
  return 0
}

// Release asset name for a platform, e.g. `moi-standalone-0.4.0-darwin-arm64.tar.gz`.
// Must match what scripts/build-standalone.ts produces.
export function standaloneAssetName(version: string, platform: string): string {
  return `moi-standalone-${version}-${platform}.tar.gz`
}

async function fetchLatestRelease(): Promise<Release> {
  const res = await fetch(`${githubApiBase()}/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'moi-update' },
    signal: AbortSignal.timeout(30_000)
  })
  if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`)
  const data = (await res.json().catch(() => null)) as unknown
  if (!data || typeof data !== 'object' || !('tag_name' in data) || !('assets' in data)) {
    throw new Error('GitHub API returned an invalid release payload')
  }
  const tagName = data.tag_name
  const assets = data.assets
  if (
    typeof tagName !== 'string' ||
    !Array.isArray(assets) ||
    !assets.every(
      asset =>
        asset &&
        typeof asset === 'object' &&
        'name' in asset &&
        typeof asset.name === 'string' &&
        'browser_download_url' in asset &&
        typeof asset.browser_download_url === 'string'
    )
  ) {
    throw new Error('GitHub API returned an invalid release payload')
  }
  return { tag_name: tagName, assets: assets as ReleaseAsset[] }
}

async function sha256(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256')
  const reader = Bun.file(path).stream().getReader()
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    hasher.update(chunk.value)
  }
  return hasher.digest('hex')
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'moi-update' },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
  })
  if (!res.ok || !res.body) throw new Error(`Download failed with ${res.status}: ${url}`)
  await Bun.write(dest, res)
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) !== 'ESRCH'
  }
}

async function lockIsStale(lockPath: string): Promise<boolean> {
  try {
    const owner = await readlink(lockPath)
    const pid = /^([1-9]\d*)-/.exec(owner)?.[1]
    return !pid || !processIsAlive(Number(pid))
  } catch {
    return true
  }
}

async function reapStaleLock(runtimeDir: string, lockPath: string): Promise<boolean> {
  if (!(await lockIsStale(lockPath))) return false
  const stale = join(runtimeDir, `.stale-lock-${process.pid}-${crypto.randomUUID()}`)
  try {
    await rename(lockPath, stale)
    await rm(stale, { recursive: true, force: true })
    return true
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return true
    return false
  }
}

type RuntimeLock = { release(): Promise<void> }

async function acquireRuntimeLock(runtimeDir: string): Promise<RuntimeLock> {
  await mkdir(runtimeDir, { recursive: true })
  const lockPath = join(runtimeDir, '.install-lock')
  const owner = `${process.pid}-${crypto.randomUUID()}`
  const deadline = Date.now() + LOCK_WAIT_MS

  while (true) {
    try {
      await symlink(owner, lockPath)
      return {
        async release() {
          try {
            if ((await readlink(lockPath)) === owner) await rm(lockPath, { force: true })
          } catch {}
        }
      }
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
    }

    if (await reapStaleLock(runtimeDir, lockPath)) continue
    if (Date.now() >= deadline) {
      throw new Error('Another moi install or update is still running')
    }
    await Bun.sleep(250)
  }
}

export async function withRuntimeLock<T>(
  runtimeDir: string,
  operation: () => Promise<T>
): Promise<T> {
  const lock = await acquireRuntimeLock(runtimeDir)
  try {
    return await operation()
  } finally {
    await lock.release()
  }
}

// Flip runtime/current to point at `version` atomically: build a process-unique
// link, then rename over the old one (rename replaces symlinks atomically on
// POSIX). Runtime-mutating callers still hold the cross-process install lock so
// the flip and subsequent prune are one transaction.
export async function flipCurrent(runtimeDir: string, version: string): Promise<void> {
  const tmp = join(runtimeDir, `.current-next-${process.pid}-${crypto.randomUUID()}`)
  try {
    await symlink(version, tmp)
    await rename(tmp, join(runtimeDir, 'current'))
  } finally {
    await rm(tmp, { force: true })
  }
}

// Keep the freshly installed version plus the one it replaced (instant
// rollback by re-pointing `current`); drop anything older.
export async function pruneVersions(runtimeDir: string, keep: string[]): Promise<void> {
  const entries = await readdir(runtimeDir)
  for (const entry of entries) {
    if (entry === 'current' || entry.startsWith('.') || keep.includes(entry)) continue
    await rm(join(runtimeDir, entry), { recursive: true, force: true })
  }
}

async function validateStagedRuntime(extracted: string, expectedVersion: string): Promise<void> {
  const pkg = JSON.parse(await readFile(join(extracted, 'app', 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (pkg.version !== expectedVersion) {
    throw new Error(
      `Release payload version ${String(pkg.version)} does not match ${expectedVersion}`
    )
  }

  const bun = await stat(join(extracted, 'bun'))
  if (!bun.isFile() || (bun.mode & 0o111) === 0) {
    throw new Error('Release payload has no executable Bun runtime')
  }
  if (!existsSync(join(extracted, 'app', 'server', 'cli.ts'))) {
    throw new Error('Release payload has no moi CLI')
  }
}

export type StandaloneUpdateResult =
  | { status: 'up-to-date'; current: string; latest: string }
  | { status: 'available'; current: string; latest: string }
  | { status: 'updated'; previous: string; version: string }

export async function updateStandalone(options: {
  check: boolean
}): Promise<StandaloneUpdateResult> {
  const home = standaloneHome()
  if (!home) throw new Error('This install is not standalone')

  const platform = currentPlatform()
  const current = VERSION
  if (!stableVersionFromTag(current)) {
    throw new Error(`Installed moi version is not a stable release: ${current}`)
  }
  console.log(pc.dim(`  checking GitHub releases (${platform})`))

  const release = await fetchLatestRelease()
  const version = stableVersionFromTag(release.tag_name)
  if (!version) {
    throw new Error(`Latest release ${release.tag_name} is not an installable stable semver tag`)
  }
  if (compareStableVersions(current, version) >= 0) {
    return { status: 'up-to-date', current, latest: version }
  }

  const assetName = standaloneAssetName(version, platform)
  const asset = release.assets.find(a => a.name === assetName)
  const checksumAsset = release.assets.find(a => a.name === `${assetName}.sha256`)
  if (!asset) throw new Error(`Release ${release.tag_name} has no standalone build for ${platform}`)
  if (!checksumAsset) {
    throw new Error(`Release ${release.tag_name} has no checksum for ${assetName}`)
  }
  if (options.check) return { status: 'available', current, latest: version }

  const runtimeDir = join(home, 'runtime')
  const operationId = `${process.pid}-${crypto.randomUUID()}`
  const stageDir = join(runtimeDir, `.stage-${version}-${operationId}`)
  const tarball = join(runtimeDir, `.${assetName}.${operationId}`)
  let replaced = current

  const changed = await withRuntimeLock(runtimeDir, async () => {
    const active = await activeInstalledVersion(runtimeDir)
    if (active) {
      if (!stableVersionFromTag(active)) {
        throw new Error(`Active moi runtime has an invalid version: ${active}`)
      }
      replaced = active
      if (compareStableVersions(active, version) >= 0) return false
    }

    try {
      console.log(pc.dim(`  downloading ${assetName}`))
      await download(asset.browser_download_url, tarball)

      const checksumRes = await fetch(checksumAsset.browser_download_url, {
        headers: { 'user-agent': 'moi-update' },
        signal: AbortSignal.timeout(30_000)
      })
      if (!checksumRes.ok) {
        throw new Error(`Could not fetch the checksum (${checksumRes.status}) — install unchanged`)
      }
      const expected = (await checksumRes.text()).trim().split(/\s+/)[0]?.toLowerCase()
      if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
        throw new Error('Release checksum is malformed — install unchanged')
      }
      const actual = await sha256(tarball)
      if (actual !== expected) {
        throw new Error('Checksum mismatch — download discarded, install unchanged')
      }

      // Tarball root is `moi-runtime/`; validate the extracted payload before
      // it can replace a version directory or the current symlink.
      await mkdir(stageDir, { recursive: true })
      await Bun.$`tar -xzf ${tarball} -C ${stageDir}`.quiet()
      const extracted = join(stageDir, 'moi-runtime')
      await validateStagedRuntime(extracted, version)

      const versionDir = join(runtimeDir, version)
      await rm(versionDir, { recursive: true, force: true })
      await rename(extracted, versionDir)
      await flipCurrent(runtimeDir, version)
      await pruneVersions(runtimeDir, [version, replaced])
      return true
    } finally {
      await rm(tarball, { force: true })
      await rm(stageDir, { recursive: true, force: true })
    }
  })

  return changed
    ? { status: 'updated', previous: replaced, version }
    : { status: 'up-to-date', current: replaced, latest: version }
}

export const uninstall = defineCommand({
  meta: { name: 'uninstall', description: 'Remove a standalone moi install' },
  args: {
    data: {
      type: 'boolean',
      description: 'Also remove moi data (workspace registry, settings)',
      default: false
    }
  },
  async run({ args }) {
    const home = standaloneHome()
    if (!home) {
      console.error('This install is not standalone — remove the npm package instead:')
      console.error('  bun rm -g moi-computer')
      process.exit(1)
    }

    if (!existsSync(home)) {
      console.error(`Nothing to remove at ${home}`)
      process.exit(1)
    }

    console.log(`This removes ${home} (the moi runtime and command).`)
    if (args.data) console.log('Workspace registry and settings will also be removed.')
    const answer = prompt('Continue? [y/N]')
    if (answer?.toLowerCase() !== 'y') {
      console.log('Cancelled — nothing removed')
      return
    }

    // Resolve the lazily imported data path before deleting the runtime that
    // contains this module, then serialize uninstall against any update or
    // desktop provisioning process.
    const dataDir = args.data
      ? safeRemovalPath((await import('./data-dir')).DATA_DIR, 'moi data')
      : null
    await withRuntimeLock(join(home, 'runtime'), async () => {
      await rm(home, { recursive: true, force: true })
      if (dataDir) await rm(dataDir, { recursive: true, force: true })
    })

    console.log('moi removed. Workspaces and their files are untouched.')
    console.log(
      pc.dim(`Remove the PATH entry for ${join(home, 'bin')} from your shell profile if needed.`)
    )
  }
})
