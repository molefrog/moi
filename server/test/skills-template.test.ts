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
    expect(design).toMatch(
      /Use `h-full w-full bg-background text-foreground` for most widget roots\./
    )
    expect(design).toContain('`text-success` / `bg-success/10`')
    expect(design).toMatch(/tint the opaque background by mixing `--background` with `--success`/)
    expect(design).toMatch(/infographic needs multiple colors to distinguish categories or series/)
    expect(design).toMatch(/Do not use palette colors for generic decoration/)
    expect(design).toContain('| Object edge | `ring-1 ring-border` |')
    expect(design).toContain('| Separator | `border-b border-border` |')
    expect(design).toMatch(/Reserve\s+one-sided borders such as `border-b` for separators/)
    expect(design).toMatch(/Never use a border\s+and a ring on the same element/)
    expect(design).not.toContain('`border-input`')
    expect(design).toMatch(/Use an open layout by default/)
    expect(design).toMatch(/Add a wrapper with its own fill, ring, radius, or shadow only when it/)
    expect(design).toMatch(/Page headers, tab rows, summaries, metrics, and ordinary sections/)
    expect(design).not.toMatch(/Page headers, tab rows, empty states/)
    expect(design).toMatch(/Keep related content in one surface/)
    expect(design).toMatch(/Avoid adjacent or nested cards/)
    expect(design).toMatch(/Align page-level content to shared edges or grid columns/)
    expect(design).toMatch(/Apply outer padding once on the root or\s+layout grid/)
    expect(design).toMatch(/do not leave spacing that implies an invisible card/)
    expect(design).toContain('`texture-checker`')
    expect(design).toContain('`texture-grid`')
    expect(design).toContain('`texture-noise`')
    expect(design).toContain('`texture-gradient-linear`')
    expect(design).toContain('`texture-inset-shadow`')
    expect(design).not.toContain('`surface-')
    expect(design).toMatch(/without setting `background-color`/)
    expect(design).toContain('`h-full w-full bg-background texture-checker`')
    expect(design).toMatch(/Use one texture on every widget or view root/)
    expect(design).toMatch(/Skip it only when an opaque full-bleed image, map,\s+canvas/)
    expect(design).toMatch(/user explicitly asks for a plain surface/)
    expect(design).toMatch(/Place one solid semantic work surface above the texture/)
    expect(design).not.toMatch(/Place the main content in opaque semantic blocks/)
    expect(design).toMatch(
      /Do not apply a second texture to a card, panel, control, or text region/
    )
    expect(design).toMatch(/Give unrelated applets different textures/)
    expect(design).toMatch(/represents a view shares that\s+view's texture/)
    expect(design).toMatch(/Custom gradients mix semantic tokens by default/)
    expect(design).not.toContain('Prefer an intentional solid color for most widgets')
    expect(design).not.toContain('### Color starting points')
    expect(design).toMatch(/Views are separate pages\.\s+Their semantic tokens inherit/)
    expect(design).toMatch(/do a removal pass from top to bottom/)
    expect(design).toMatch(/Review every visible element and\s+wrapper/)
    expect(design).toMatch(/Realign children after removing a wrapper/)
    expect(design).toMatch(/loading, empty, success, and error states stay in\s+that same surface/)
    expect(design).toMatch(
      /Keep\s+interaction feedback on the control that performs\s+the action\./
    )
    expect(design).toMatch(/The widget surface stays unchanged on\s+hover\./)
    expect(design).not.toContain('tactile interaction')
    expect(design).not.toContain('| Interaction |')
    expect(design).not.toContain('Interaction feedback covers hover')
    expect(await Bun.file(join(workspaceSkillDir, 'SKILL.md')).text()).toContain(
      '<moi-skill version="0.11.0" />'
    )
    expect(await Bun.file(workspaceNote).text()).toBe('Keep this note\n')
    expect(await Bun.file(customSkill).text()).toBe('Keep this skill\n')
  })
})
