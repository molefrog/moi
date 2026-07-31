import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { installBundledSkills } from '../skills-template'

let targetSkillsDir = ''

afterEach(async () => {
  if (!targetSkillsDir) return
  await rm(targetSkillsDir, { recursive: true, force: true })
  targetSkillsDir = ''
})

describe('installBundledSkills', () => {
  test('installs bundled skills while preserving unrelated workspace files', async () => {
    targetSkillsDir = await mkdtemp(join(tmpdir(), 'moi-skills-'))
    const workspaceSkillDir = join(targetSkillsDir, 'moi-workspace')
    const customSkillDir = join(targetSkillsDir, 'custom-skill')
    const workspaceNote = join(workspaceSkillDir, 'NOTES.md')
    const customSkill = join(customSkillDir, 'SKILL.md')

    await mkdir(workspaceSkillDir, { recursive: true })
    await mkdir(customSkillDir, { recursive: true })
    await Promise.all([
      Bun.write(workspaceNote, 'Keep this note\n'),
      Bun.write(customSkill, 'Keep this skill\n')
    ])

    await installBundledSkills(targetSkillsDir)

    const design = await Bun.file(join(workspaceSkillDir, 'DESIGN.md')).text()
    expect(design).toMatch(
      /every widget\s+root must cover the full frame with an opaque background\./
    )
    expect(design).toContain('The host applies the `.dark` class around every widget')
    expect(design).toContain("Choose each widget's background deliberately")
    expect(design).toMatch(/Prefer an intentional solid color for most widgets/)
    expect(design).not.toContain('### Color starting points')
    expect(design).toMatch(/`h-full w-full bg-background text-foreground` is a sensible\s+fallback/)
    expect(design).toMatch(/Views are separate pages\.\s+Their semantic tokens inherit/)
    expect(design).toMatch(
      /Keep\s+interaction feedback on the control that performs\s+the action\./
    )
    expect(design).toMatch(/The widget surface stays unchanged on\s+hover\./)
    expect(design).not.toContain('tactile interaction')
    expect(design).not.toContain('| Interaction |')
    expect(design).not.toContain('Interaction feedback covers hover')
    expect(await Bun.file(join(workspaceSkillDir, 'SKILL.md')).text()).toContain(
      '<moi-skill version="0.10.0" />'
    )
    expect(await Bun.file(workspaceNote).text()).toBe('Keep this note\n')
    expect(await Bun.file(customSkill).text()).toBe('Keep this skill\n')
  })
})
