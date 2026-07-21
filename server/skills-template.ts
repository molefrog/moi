// Skills the project ships, copied into a target workspace by `moi init`
// (Claude Code workspace) and `moi openclaw init <agent>` (OpenClaw agent
// workspace). Both commands take a fresh or existing directory and lay
// down the same set of skill folders.
import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

// Source directory for shipped templates. Resolved relative to this file so
// symlinked CLI binaries still find the source tree.
export const TEMPLATE_DIR = join(import.meta.dir, '..', 'workspace')

// The folder holding the skill packages this CLI ships. Each subdirectory is
// one skill (e.g. `moi-workspace/`) with its own `SKILL.md`. Source of truth
// for what `moi skill update` copies and what versions it compares against.
export const BUNDLED_SKILLS_DIR = join(TEMPLATE_DIR, '.claude', 'skills')

// Files removed from bundled skills that older workspaces may still have.
// Keep this list narrow so skill updates preserve unrelated user files.
const RETIRED_BUNDLED_SKILL_FILES = [['moi-workspace', 'VIEW-DESIGN.md']] as const

// Copy each shipped skill folder into `targetSkillsDir`. Overwrites existing
// files (e.g. on a re-install after a moi upgrade) but leaves unrelated
// directories alone. Creates the target if missing.
export async function installBundledSkills(targetSkillsDir: string): Promise<void> {
  await mkdir(targetSkillsDir, { recursive: true })
  await Promise.all(
    RETIRED_BUNDLED_SKILL_FILES.map(parts => rm(join(targetSkillsDir, ...parts), { force: true }))
  )
  await cp(BUNDLED_SKILLS_DIR, targetSkillsDir, {
    recursive: true,
    force: true
  })
}
