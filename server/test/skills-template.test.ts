import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installBundledSkills } from '../skills-template'
import { updateWorkspaceSkills } from '../skill-update'

const SKILL_MD = join('moi-workspace', 'SKILL.md')
const CHEAT_SHEET = join('moi-workspace', 'references', 'UI-COMPONENTS.md')

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'moi-skills-'))
  try {
    await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('installBundledSkills', () => {
  test('installs the ui-components section and cheat sheet for every workspace', async () => {
    await withTempDir(async dir => {
      await installBundledSkills(dir)

      const skillMd = await Bun.file(join(dir, SKILL_MD)).text()
      expect(skillMd).toContain('Standard UI components')
      expect(skillMd).toContain('moi ui-components add')
      expect(await Bun.file(join(dir, CHEAT_SHEET)).exists()).toBe(true)
      // The rest of the skill installs normally.
      expect(skillMd).toContain('# Workspace')
    })
  })

  test('no experimental-shadcn gate markers survive in the shipped skill', async () => {
    await withTempDir(async dir => {
      await installBundledSkills(dir)
      expect(await Bun.file(join(dir, SKILL_MD)).text()).not.toContain('experimental-shadcn')
    })
  })

  test('moi skill update restores the section for a workspace installed before the flag went away', async () => {
    // Skills live under <workspace>/.claude/skills for the default backend —
    // updateWorkspaceSkills re-derives that from the workspace root.
    await withTempDir(async workspace => {
      const skillsDir = join(workspace, '.claude', 'skills')
      await installBundledSkills(skillsDir)

      // Simulate a pre-graduation opt-out: section stripped, cheat sheet absent.
      const skillMd = join(skillsDir, SKILL_MD)
      const stripped = (await Bun.file(skillMd).text()).replace(/## Standard UI components/, '')
      await Bun.write(skillMd, stripped)
      rmSync(join(skillsDir, CHEAT_SHEET), { force: true })

      await updateWorkspaceSkills(workspace)

      expect(await Bun.file(skillMd).text()).toContain('Standard UI components')
      expect(await Bun.file(join(skillsDir, CHEAT_SHEET)).exists()).toBe(true)
    })
  })
})
