// Skill versioning for Case 1: a workspace's installed skill copy drifting
// behind the version this CLI ships. The CLI is "stupid" — it only reads the
// `version:` stamped in each skill's `SKILL.md` frontmatter, compares the
// workspace copy against the bundled copy, and reports drift. Updating is never
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

// Parse the `version:` field out of a `SKILL.md` YAML frontmatter block.
// Deliberately tiny (no YAML dependency) — frontmatter here is flat. Returns
// `null` when the file or the field is missing.
export async function readSkillVersion(skillMdPath: string): Promise<string | null> {
  const file = Bun.file(skillMdPath)
  if (!(await file.exists())) return null
  const text = await file.text()
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fm) return null
  const m = fm[1].match(/^version:\s*["']?([^"'\s]+)["']?\s*$/m)
  return m ? m[1] : null
}

function parse(v: string): [number, number, number] {
  const [a, b, c] = v.split('.').map(n => parseInt(n, 10))
  return [a || 0, b || 0, c || 0]
}

// True when `bundled` is a newer MINOR-or-major release than `installed`. Patch
// bumps are intentionally silent — they don't change behavior worth surfacing,
// and `moi skill update` brings them along on the next minor update anyway. A
// missing `installed` counts as behind (legacy workspace, no stamp yet).
export function isMinorBehind(installed: string | null, bundled: string | null): boolean {
  if (!bundled) return false
  if (!installed) return true
  const [ia, ib] = parse(installed)
  const [ba, bb] = parse(bundled)
  if (ba !== ia) return ba > ia
  return bb > ib
}

// Any difference at all, patch included. Used to decide whether `moi skill
// update` would change anything for status display.
export function isBehind(installed: string | null, bundled: string | null): boolean {
  if (!bundled) return false
  if (!installed) return true
  const [ia, ib, ic] = parse(installed)
  const [ba, bb, bc] = parse(bundled)
  if (ba !== ia) return ba > ia
  if (bb !== ib) return bb > ib
  return bc > ic
}

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
