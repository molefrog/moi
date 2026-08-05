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
    const designContracts = {
      color: [
        /Widgets and views use the same semantic token vocabulary/,
        /Use\s+`h-full w-full bg-background text-foreground` for most applet roots\./,
        /Each token keeps the same\s+purpose in both applet types/,
        /The host applies a widget-local semantic theme derived from the selected workspace\s+color/,
        /`background` is the workspace `primary`, `foreground` is its paired readable color/,
        /every widget\s+root must cover the full frame with an opaque background\./,
        /Views:\*\* Semantic tokens inherit the workspace page theme/,
        /Portalled UI:\*\* Menus, tooltips, and popovers render in workspace scope/,
        /Use lower opacity from the surface's foreground only for tertiary metadata that remains\s+readable\./,
        /Avoid weak alpha text for important labels or values\./,
        /Derive extra neutral or tonal colors and custom gradients from the local semantic tokens/,
        /Use Tailwind palette colors only when they have clear content\s+meaning, distinguish\s+infographic\s+data, or follow an explicit user request/,
        /Do not use palette colors\s+for generic decoration or\s+unrelated widget backgrounds/,
        /never use a\s+purple gradient as a default creativity or technology cue/,
        /Never use a border\s+and a ring on the same element/
      ],
      surfaces: [
        /Use an open layout by default/,
        /Add one surface around content that shares a functional boundary: an\s+interactive object, an independently scrolling region, a distinct state, or a self-contained work\s+region/,
        /Page headers,\s+tab rows, summaries, metrics, and ordinary sections stay unboxed by default/,
        /Never use a large rounded surface as\s+a second page frame/,
        /Avoid adjacent or nested cards/,
        /Align page-level content to shared edges or grid columns/,
        /do not leave spacing that implies an invisible card/
      ],
      textures: [
        /Use one texture on every widget or view root and no more than one per applet/,
        /Pair it with an opaque\s+semantic base/,
        /same\s+classes resolve through the widget-local theme or view page theme/,
        /Skip it only when an opaque\s+full-bleed image, map, canvas, or visualization owns the background/,
        /the user explicitly asks for a\s+plain surface/,
        /preserving readability would require several extra solid wrappers/,
        /Open content may sit directly on the textured root when contrast stays clear/,
        /Add an opaque\s+semantic surface above it only when that surface has a functional reason/,
        /Give unrelated applets different textures/,
        /represents a view shares that\s+view's texture/
      ],
      statesAndReview: [
        /When a primary region uses a surface, loading, populated, empty, success, and error states keep that\s+surface in the same position and size/,
        /do a removal pass from top to bottom/,
        /For every visible element and wrapper/,
        /then realign the remaining content/
      ],
      interaction: [
        /Keep\s+interaction feedback on the control that performs\s+the action\./,
        /The widget surface stays unchanged on\s+hover\./
      ]
    }

    expect(design.match(/\| Context or intent \| Tailwind classes \| Use \|/g)).toHaveLength(1)

    for (const contracts of Object.values(designContracts)) {
      for (const contract of contracts) expect(design).toMatch(contract)
    }

    for (const token of [
      '| Applet root | `bg-background text-foreground` |',
      '| Main content | `text-foreground` |',
      '| Supporting content | `text-muted-foreground` |',
      '| Inset surface | `bg-card text-card-foreground` |',
      '| Floating surface | `bg-popover text-popover-foreground` |',
      '| Quiet fill | `bg-muted` |',
      '| Control state | `bg-accent text-accent-foreground` |',
      '`bg-primary text-primary-foreground hover:bg-primary/90`',
      '`text-success` / `bg-success/10`',
      '| Object edge | `ring-1 ring-border` |',
      '| Focus | `focus-visible:ring-2 focus-visible:ring-ring` |',
      '| Separator | `border-b border-border` |',
      '`texture-checker`',
      '`texture-grid`',
      '`texture-noise`',
      '`texture-gradient-linear`',
      '`texture-inset-shadow`',
      '`h-full w-full bg-background text-foreground texture-checker`'
    ]) {
      expect(design).toContain(token)
    }

    for (const staleGuidance of [
      '`border-input`',
      '`surface-',
      'Place the main content in opaque semantic blocks',
      'Prefer an intentional solid color for most widgets',
      '### Color starting points',
      'tactile interaction',
      '| Interaction |',
      'Interaction feedback covers hover',
      'The host applies the `.dark` class around every widget',
      'Use `h-full w-full bg-primary text-primary-foreground` for most widget roots',
      '| Default widget root | `bg-primary text-primary-foreground` |',
      '| Tertiary or unavailable content |',
      'tint the opaque surface by mixing',
      '### Widget surfaces',
      '### View surfaces'
    ]) {
      expect(design).not.toContain(staleGuidance)
    }
    const skill = await Bun.file(join(workspaceSkillDir, 'SKILL.md')).text()
    for (const contract of ['<moi-skill version="0.11.0" />', '`moi theme --radius=<key>`']) {
      expect(skill).toContain(contract)
    }
    expect(skill).toMatch(
      /After the final successful bundle and any checks[\s\S]*`moi tab focus widgets`[\s\S]*`moi tab focus view:<view-id>`/
    )
    expect(await Bun.file(workspaceNote).text()).toBe('Keep this note\n')
    expect(await Bun.file(customSkill).text()).toBe('Keep this skill\n')
  })
})
