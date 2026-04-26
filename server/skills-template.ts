// Skills the project ships, copied into a target workspace by `moi init`
// (Claude Code workspace) and `moi openclaw init <agent>` (OpenClaw agent
// workspace). Both commands take a fresh or existing directory and lay
// down the same set of skill folders.
import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// Source directory for shipped templates. Resolved relative to this file so
// symlinked CLI binaries still find the source tree.
export const TEMPLATE_DIR = join(import.meta.dir, '..', 'workspace')

// Copy each shipped skill folder into `targetSkillsDir`. Overwrites existing
// files (e.g. on a re-install after a moi upgrade) but leaves unrelated
// directories alone. Creates the target if missing.
export async function installBundledSkills(targetSkillsDir: string): Promise<void> {
  await mkdir(targetSkillsDir, { recursive: true })
  await cp(join(TEMPLATE_DIR, '.claude', 'skills'), targetSkillsDir, {
    recursive: true,
    force: true
  })
}
