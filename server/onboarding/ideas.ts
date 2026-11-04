import { z } from 'zod'
import { APP_ICON_IDS } from '@/lib/app-icons'
import { COLOR_THEMES, FONT_THEMES, type ColorTheme, type FontTheme } from '@/lib/themes'
import type { OnboardingIdea } from '@/lib/onboarding'

const appletPlan = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    features: z.array(z.string().trim().min(1).max(500)).min(1).max(6)
  })
  .strict()

const idea = z
  .object({
    name: z.string().trim().min(1).max(24),
    icon: z.enum(APP_ICON_IDS),
    theme: z
      .object({
        font: z.enum(Object.keys(FONT_THEMES) as FontTheme[]),
        color: z.enum(Object.keys(COLOR_THEMES) as ColorTheme[])
      })
      .strict(),
    description: z.string().trim().min(1).max(200),
    views: z
      .array(
        appletPlan.extend({
          icon: z.enum(APP_ICON_IDS)
        })
      )
      .length(3),
    widgets: z.array(appletPlan).max(4)
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
