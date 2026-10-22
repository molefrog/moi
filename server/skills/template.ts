// Skills the project ships, copied into a target workspace by `moi init`
// (Claude Code workspace) and `moi openclaw init <agent>` (OpenClaw agent
// workspace). Both commands take a fresh or existing directory and lay
// down the same set of skill folders.
import { cp, lstat, mkdir, readFile, readdir, readlink } from 'node:fs/promises'
import { join } from 'node:path'

// Source directory for shipped templates. Resolved relative to this file so
// symlinked CLI binaries still find the source tree.
export const TEMPLATE_DIR = join(import.meta.dir, '..', '..', 'workspace')

// The folder holding the skill packages this CLI ships. Each subdirectory is
// one skill (e.g. `moi-workspace/`) with its own `SKILL.md`. Source of truth
// for what `moi skill update` copies and what versions it compares against.
export const BUNDLED_SKILLS_DIR = join(TEMPLATE_DIR, '.claude', 'skills')

export async function bundledSkillNames(): Promise<string[]> {
  const entries = await readdir(BUNDLED_SKILLS_DIR, { withFileTypes: true })
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
}

export const COLLAB_REFERENCE_SOURCE_PATH = join(
  BUNDLED_SKILLS_DIR,
  'moi-workspace',
  'references',
  'COLLAB.md'
)

// The guide lives beside the other references, but only explicit collab init installs it.
function isDefaultSkillFile(source: string): boolean {
  return source !== COLLAB_REFERENCE_SOURCE_PATH
}

async function matchesBundledPath(source: string, target: string): Promise<boolean> {
  const sourceStat = await lstat(source)
  const targetStat = await lstat(target).catch(() => null)
  if (!targetStat) return false

  if (sourceStat.isDirectory()) {
    if (!targetStat.isDirectory()) return false
    const entries = (await readdir(source)).filter(entry => isDefaultSkillFile(join(source, entry)))
    const matches = await Promise.all(
      entries.map(entry => matchesBundledPath(join(source, entry), join(target, entry)))
    )
    return matches.every(Boolean)
  }

  if (sourceStat.isFile()) {
    if (!targetStat.isFile() || sourceStat.size !== targetStat.size) return false
    const [sourceContents, targetContents] = await Promise.all([readFile(source), readFile(target)])
    return sourceContents.equals(targetContents)
  }

  if (sourceStat.isSymbolicLink()) {
    if (!targetStat.isSymbolicLink()) return false
    const [sourceLink, targetLink] = await Promise.all([readlink(source), readlink(target)])
    return sourceLink === targetLink
  }

  return false
}

// Copy changed shipped skill folders into `targetSkillsDir`. Leaves identical
// skills untouched, along with unrelated directories and extra local files.
// Creates the target if missing and returns the names whose bundled files changed.
//
// The ui-components section used to be stripped here unless a workspace opted
// in with `moi init --experimental-shadcn`. It ships to everyone now; the skill
// version bump is what pulls it into workspaces installed before the flag went
// away (the copy below restores both the section and its cheat sheet).
export async function installBundledSkills(targetSkillsDir: string): Promise<string[]> {
  await mkdir(targetSkillsDir, { recursive: true })
  const changedSkills: string[] = []
  for (const name of await bundledSkillNames()) {
    if (await installBundledSkill(name, join(targetSkillsDir, name))) changedSkills.push(name)
  }

  return changedSkills
}

// Update one resolved destination without installing other skills beside it.
export async function installBundledSkill(name: string, target: string): Promise<boolean> {
  const source = join(BUNDLED_SKILLS_DIR, name)
  if (await matchesBundledPath(source, target)) return false
  // Publish the version only after all references copied successfully, so a
  // partial update cannot hide an outdated installation behind a fresh marker.
  const marker = join(source, 'SKILL.md')
  await cp(source, target, {
    recursive: true,
    force: true,
    filter: path => path !== marker && isDefaultSkillFile(path)
  })
  await cp(marker, join(target, 'SKILL.md'), { force: true })
  return true
}
