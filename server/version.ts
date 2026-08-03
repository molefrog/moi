import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The package root of the code that is actually running — server and CLI both
// resolve their own tree, so a CLI from one install never reports another's
// version.
export const PACKAGE_ROOT = join(import.meta.dir, '..')

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      version?: string
    }
    if (typeof pkg.version === 'string') return pkg.version
  } catch {}
  return '0.0.0'
}

// Snapshotted at module load, deliberately: after `bun i -g` swaps the install
// tree under a running server, the server must keep reporting the version of
// the code it loaded — reading package.json lazily would claim the new version
// while old code runs (and under pnpm the old realpath may not even exist).
export const VERSION = readPackageVersion()

// True for a prerelease like `0.5.2-next.1` — those are published to a dist-tag
// other than `latest`, so `moi update` leaves them alone.
export function isPrerelease(version: string): boolean {
  return version.includes('-')
}

// `<package version> (<8-char commit>)`, e.g. `0.1.3 (27e17e80)`. The commit is
// read from git at call time, so it appears for a source/`bun link` checkout and
// is simply omitted for a published package (which ships no .git).
export function versionWithCommit(): string {
  let commit = ''
  try {
    const out = Bun.spawnSync(['git', 'rev-parse', '--short=8', 'HEAD'], { cwd: PACKAGE_ROOT })
    if (out.success) commit = out.stdout.toString().trim()
  } catch {}
  return commit ? `${VERSION} (${commit})` : VERSION
}
