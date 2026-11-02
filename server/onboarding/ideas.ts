import { z } from 'zod'
import { APP_ICON_IDS } from '@/lib/app-icons'
import { COLOR_THEMES, FONT_THEMES, type ColorTheme, type FontTheme } from '@/lib/themes'
import type { OnboardingIdea } from '@/lib/onboarding'

const appletPlan = z
  .object({
    name: z.string().trim().min(1).max(100).describe('Short name in sentence case'),
    description: z.string().trim().min(1).max(500).describe('Purpose and main content'),
    features: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(6)
      .describe('Concrete content, actions, behavior, data sources, and saved state to implement')
  })
  .strict()

const idea = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe('Workspace name in sentence case, preserving proper nouns'),
    icon: z.enum(APP_ICON_IDS).describe('One built-in Moi icon, rendered on the theme background'),
    theme: z
      .object({
        font: z.enum(Object.keys(FONT_THEMES) as FontTheme[]),
        color: z.enum(Object.keys(COLOR_THEMES) as ColorTheme[])
      })
      .strict()
      .describe(
        'Workspace customization. Choose a different font and a different color for each option.'
      ),
    description: z
      .string()
      .trim()
      .min(1)
      .max(280)
      .describe(
        'One or two short sentences: what the workspace does and why it fits this person. Refer broadly to relevant context; omit dates, meeting titles, names, and research details.'
      ),
    views: z
      .array(
        appletPlan.extend({
          icon: z.enum(APP_ICON_IDS).describe('Built-in Moi icon for this view')
        })
      )
      .length(4)
      .describe('Full-page tools, each with its own tab and build chat'),
    widgets: z.array(appletPlan).max(4).describe('Small focused cards on Overview')
  })
  .strict()

export const onboardingIdeaSchema = idea.extend({ id: z.string().uuid() })
export const ideasSchema = z.object({ options: z.array(idea).length(3) }).strict()
export function parseIdeas(value: unknown): OnboardingIdea[] {
  const result = ideasSchema.parse(value)
  if (new Set(result.options.map(option => option.name.toLowerCase())).size !== 3)
    throw new Error('The agent returned duplicate ideas. Try again')
  if (
    new Set(result.options.map(option => option.theme.font)).size !== 3 ||
    new Set(result.options.map(option => option.theme.color)).size !== 3
  )
    throw new Error('Each idea needs a different font and color. Try again')
  return result.options.map(option => ({ ...option, id: crypto.randomUUID() }))
}
