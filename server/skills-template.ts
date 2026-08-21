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

// TEMPORARY gate for the ui-components rollout: the "Standard UI components"
// section ships in the bundled SKILL.md wrapped in these markers, and installs
// only for workspaces that opted in via `moi init --experimental-shadcn`.
// Everything else (the `moi ui-components` command itself, the build patches)
// is always present — the gate only controls whether the skill TELLS agents
// about it. Remove the markers, this stripping, and the flag when the feature
// graduates.
const EXPERIMENTAL_SHADCN_START = '<!-- moi:experimental-shadcn -->'
const EXPERIMENTAL_SHADCN_END = '<!-- /moi:experimental-shadcn -->'
// The cheat sheet only makes sense alongside the section — omitted with it.
const EXPERIMENTAL_SHADCN_FILES = ['moi-workspace/references/UI-COMPONENTS.md']
const GATED_SKILL_MD = 'moi-workspace/SKILL.md'

// Remove every marked experimental-shadcn block (markers included), collapsing
// the blank lines the removal leaves behind.
export function stripExperimentalShadcn(text: string): string {
  let out = text
  for (;;) {
    const start = out.indexOf(EXPERIMENTAL_SHADCN_START)
    if (start === -1) break
    const end = out.indexOf(EXPERIMENTAL_SHADCN_END, start)
    if (end === -1) break
    out = out.slice(0, start) + out.slice(end + EXPERIMENTAL_SHADCN_END.length)
  }
  return out.replace(/\n{3,}/g, '\n\n')
}

// Whether a previously installed skills dir opted into the experimental
// ui-components section — the marker survives in the installed SKILL.md, so
// its presence IS the stored flag. Lets `moi skill update` (and an unflagged
// re-init) preserve the choice without any registry state.
export async function hasExperimentalShadcn(targetSkillsDir: string): Promise<boolean> {
  const file = Bun.file(join(targetSkillsDir, GATED_SKILL_MD))
  if (!(await file.exists())) return false
  return (await file.text()).includes(EXPERIMENTAL_SHADCN_START)
}

export type InstallBundledSkillsOptions = {
  // Keep the experimental-shadcn section (see the gate note above). Defaults
  // to preserving whatever the target dir already chose.
  experimentalShadcn?: boolean
}

// Copy each shipped skill folder into `targetSkillsDir`. Overwrites existing
// files (e.g. on a re-install after a moi upgrade) but leaves unrelated
// directories alone. Creates the target if missing.
export async function installBundledSkills(
  targetSkillsDir: string,
  options: InstallBundledSkillsOptions = {}
): Promise<void> {
  const experimentalShadcn =
    options.experimentalShadcn ?? (await hasExperimentalShadcn(targetSkillsDir))
  await mkdir(targetSkillsDir, { recursive: true })
  await cp(BUNDLED_SKILLS_DIR, targetSkillsDir, {
    recursive: true,
    force: true
  })
  if (experimentalShadcn) return

  const skillMd = join(targetSkillsDir, GATED_SKILL_MD)
  await Bun.write(skillMd, stripExperimentalShadcn(await Bun.file(skillMd).text()))
  for (const rel of EXPERIMENTAL_SHADCN_FILES) {
    await rm(join(targetSkillsDir, rel), { force: true })
  }
}
