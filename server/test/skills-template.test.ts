import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  hasExperimentalShadcn,
  installBundledSkills,
  stripExperimentalShadcn
} from '../skills-template'
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

describe('stripExperimentalShadcn', () => {
  test('removes marked blocks and collapses blank lines', () => {
    const text =
      'before\n\n<!-- moi:experimental-shadcn -->\ngated\n<!-- /moi:experimental-shadcn -->\n\nafter\n'
    expect(stripExperimentalShadcn(text)).toBe('before\n\nafter\n')
  })

  test('leaves unmarked text untouched', () => {
    const text = 'plain\n\ncontent\n'
    expect(stripExperimentalShadcn(text)).toBe(text)
  })
})

describe('installBundledSkills experimental-shadcn gate', () => {
  test('strips the section and the cheat sheet by default', async () => {
    await withTempDir(async dir => {
      await installBundledSkills(dir)

      const skillMd = await Bun.file(join(dir, SKILL_MD)).text()
      expect(skillMd).not.toContain('moi:experimental-shadcn')
      expect(skillMd).not.toContain('Standard UI components')
      expect(await Bun.file(join(dir, CHEAT_SHEET)).exists()).toBe(false)
      // The rest of the skill installs normally.
      expect(skillMd).toContain('# Workspace')
      expect(await hasExperimentalShadcn(dir)).toBe(false)
    })
  })

  test('keeps the section, markers, and cheat sheet when opted in', async () => {
    await withTempDir(async dir => {
      await installBundledSkills(dir, { experimentalShadcn: true })

      const skillMd = await Bun.file(join(dir, SKILL_MD)).text()
      expect(skillMd).toContain('Standard UI components')
      expect(skillMd).toContain('moi ui-components add')
      expect(await Bun.file(join(dir, CHEAT_SHEET)).exists()).toBe(true)
      expect(await hasExperimentalShadcn(dir)).toBe(true)
    })
  })

  test('an unflagged re-install preserves a prior opt-in', async () => {
    await withTempDir(async dir => {
      await installBundledSkills(dir, { experimentalShadcn: true })
      await installBundledSkills(dir)

      expect(await Bun.file(join(dir, SKILL_MD)).text()).toContain('Standard UI components')
      expect(await Bun.file(join(dir, CHEAT_SHEET)).exists()).toBe(true)
    })
  })

  test('moi skill update preserves the choice in both directions', async () => {
    // Skills live under <workspace>/.claude/skills for the default backend —
    // updateWorkspaceSkills re-derives that from the workspace root.
    await withTempDir(async workspace => {
      const skillsDir = join(workspace, '.claude', 'skills')

      await installBundledSkills(skillsDir)
      await updateWorkspaceSkills(workspace)
      expect(await Bun.file(join(skillsDir, SKILL_MD)).text()).not.toContain(
        'Standard UI components'
      )

      await installBundledSkills(skillsDir, { experimentalShadcn: true })
      await updateWorkspaceSkills(workspace)
      expect(await Bun.file(join(skillsDir, SKILL_MD)).text()).toContain('Standard UI components')
      expect(await Bun.file(join(skillsDir, CHEAT_SHEET)).exists()).toBe(true)
    })
  })
})
