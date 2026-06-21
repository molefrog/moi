// Skill versioning for Case 1: a workspace's installed skill copy drifting
// behind the version this CLI ships. The CLI is "stupid" — it only reads the
// version marker stamped in each skill's `SKILL.md`, compares the workspace
// copy against the bundled copy, and reports drift. Updating is never
// automatic: the agent (which reads command output) sees the notice and runs
// `moi skill update`. See `moi skill` in `cli.ts`.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { findWorkspaceForPath, liftToWorkspaceRoot, listWorkspaces } from './registry'
import { BUNDLED_SKILLS_DIR } from './skills-template'

export type SkillStatus = {
  name: string
  // Version stamped in the workspace's copy. `null` means absent — either the
  // skill isn't installed or it predates skill versioning (treated as behind).
  installed: string | null
  // Version shipped with this CLI. `null` only if a bundled skill lacks a stamp.
  bundled: string | null
}

// The version is stamped as a self-contained marker in SKILL.md, e.g.
// `<moi-skill version="0.1.0" />`, rather than in YAML frontmatter. SKILL.md
// frontmatter is NOT reliably strict YAML — the free-text `description` routinely
// contains `: ` and other tokens that make real parsers reject the block — so a
// controlled, unambiguous marker we own is both simpler and more robust than
// scraping the frontmatter. Returns `null` when the file or marker is missing.
const VERSION_MARKER = /<moi-skill\b[^>]*\bversion="([^"]+)"/

export async function readSkillVersion(skillMdPath: string): Promise<string | null> {
  const file = Bun.file(skillMdPath)
  if (!(await file.exists())) return null
  const m = (await file.text()).match(VERSION_MARKER)
  return m ? m[1] : null
}

// Bun.semver (built-in: `order` + `satisfies`) isn't in this repo's bun-types
// yet, so reach it through a narrow typed view rather than `any`.
const semver = (
  Bun as unknown as {
    semver: {
      order(a: string, b: string): -1 | 0 | 1
      satisfies(v: string, range: string): boolean
    }
  }
).semver

function isValidVersion(v: string): boolean {
  try {
    semver.order(v, v)
    return true
  } catch {
    return false
  }
}

// Compare an installed version against the bundled one with Bun's semver.
// `behind` = bundled is strictly newer; `minorBehind` = that gap is at least a
// minor bump (patch gaps stay silent). `~installed` spans installed's whole
// major.minor, so a bundled version outside it is a minor-or-major bump. A
// missing/invalid installed counts as behind (legacy or broken stamp → prompt);
// a missing/invalid bundled never does (don't nag on our own broken ship).
function compare(
  installed: string | null,
  bundled: string | null
): { behind: boolean; minorBehind: boolean } {
  if (!bundled || !isValidVersion(bundled)) return { behind: false, minorBehind: false }
  if (!installed || !isValidVersion(installed)) return { behind: true, minorBehind: true }
  const behind = semver.order(installed, bundled) < 0
  return { behind, minorBehind: behind && !semver.satisfies(bundled, `~${installed}`) }
}

// Bundled is a MINOR-or-major release ahead — surfaced to the agent. Patch bumps
// stay silent and ride along on the next minor update.
export const isMinorBehind = (installed: string | null, bundled: string | null): boolean =>
  compare(installed, bundled).minorBehind

// Any difference at all, patch included — decides whether `moi skill update`
// would change anything, for status display.
export const isBehind = (installed: string | null, bundled: string | null): boolean =>
  compare(installed, bundled).behind

// Skills shipped with this CLI — directory names under the bundled skills dir.
export async function bundledSkillNames(): Promise<string[]> {
  try {
    const entries = await readdir(BUNDLED_SKILLS_DIR, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

// Per-skill installed-vs-bundled versions for a workspace root.
export async function skillStatuses(workspaceRoot: string): Promise<SkillStatus[]> {
  const names = await bundledSkillNames()
  return Promise.all(
    names.map(async name => ({
      name,
      bundled: await readSkillVersion(join(BUNDLED_SKILLS_DIR, name, 'SKILL.md')),
      installed: await readSkillVersion(join(workspaceRoot, '.claude', 'skills', name, 'SKILL.md'))
    }))
  )
}

// Resolve a path to its workspace root: the registered workspace that owns it,
// else lifted out of any `.moi/`, else the path itself. Mirrors how `moi
// bundle` resolves a target so `moi skill` works from the same places.
export async function resolveWorkspaceRoot(cwd: string): Promise<string> {
  const ws = findWorkspaceForPath(await listWorkspaces(), cwd)
  if (ws) return ws.path
  return liftToWorkspaceRoot(cwd)
}

// One-line, agent-facing notice when any installed skill is a minor+ behind the
// bundled version — else `null`. Other commands append it to their output so
// the agent reading that output knows to run `moi skill update`. Never throws:
// version checks must not break the command they ride on.
export async function staleSkillNotice(cwd: string): Promise<string | null> {
  try {
    const root = await resolveWorkspaceRoot(cwd)
    const stale = (await skillStatuses(root)).filter(s => isMinorBehind(s.installed, s.bundled))
    if (stale.length === 0) return null
    const parts = stale.map(s => `${s.name} (${s.installed ?? 'none'} → ${s.bundled})`)
    return `⚠ moi skill outdated: ${parts.join(', ')} — run \`moi skill update\` to refresh.`
  } catch {
    return null
  }
}
