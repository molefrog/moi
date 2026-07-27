import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { BUNDLED_SKILLS_DIR, installBundledSkills } from '../skills-template'

let targetSkillsDir = ''

afterEach(async () => {
  if (!targetSkillsDir) return
  await rm(targetSkillsDir, { recursive: true, force: true })
  targetSkillsDir = ''
})

describe('installBundledSkills', () => {
  test('removes retired files while preserving unrelated workspace skills', async () => {
    targetSkillsDir = await mkdtemp(join(tmpdir(), 'moi-skills-'))
    const workspaceSkillDir = join(targetSkillsDir, 'moi-workspace')
    const customSkillDir = join(targetSkillsDir, 'custom-skill')
    const retiredViewDesign = join(workspaceSkillDir, 'VIEW-DESIGN.md')
    const workspaceNote = join(workspaceSkillDir, 'NOTES.md')
    const customSkill = join(customSkillDir, 'SKILL.md')

    await mkdir(workspaceSkillDir, { recursive: true })
    await mkdir(customSkillDir, { recursive: true })
    await Promise.all([
      Bun.write(retiredViewDesign, 'Old view guidance\n'),
      Bun.write(workspaceNote, 'Keep this note\n'),
      Bun.write(customSkill, 'Keep this skill\n')
    ])

    await installBundledSkills(targetSkillsDir)

    expect(await Bun.file(retiredViewDesign).exists()).toBe(false)
    const designGuide = Bun.file(join(workspaceSkillDir, 'DESIGN.md'))
    expect(await designGuide.exists()).toBe(true)
    expect(await designGuide.text()).toContain(
      'bunx --bun shadcn@latest add <components...> --cwd .moi'
    )
    expect(await Bun.file(join(workspaceSkillDir, 'SKILL.md')).text()).toContain(
      '<moi-skill version="0.9.0" />'
    )
    expect(await Bun.file(workspaceNote).text()).toBe('Keep this note\n')
    expect(await Bun.file(customSkill).text()).toBe('Keep this skill\n')
    expect(await Bun.file(join(BUNDLED_SKILLS_DIR, 'shadcn', 'SKILL.md')).exists()).toBe(false)
  })
})
