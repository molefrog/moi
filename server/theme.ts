import {
  AGENT_THEMES,
  COLOR_THEMES,
  FONT_THEMES,
  RADIUS_THEMES,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { AgentTheme, ColorTheme, FontTheme, RadiusTheme, WorkspaceTheme } from '@/lib/types'

export type ThemeUpdate = { font?: string; color?: string; radius?: string; agent?: string }
export type ThemeUpdateResult =
  | {
      ok: true
      theme: WorkspaceTheme
      applied: Partial<WorkspaceTheme>
    }
  | { ok: false; error: string }

export function applyThemeUpdate(
  current: WorkspaceTheme | undefined,
  update: ThemeUpdate
): ThemeUpdateResult {
  if (update.font && !(update.font in FONT_THEMES)) {
    return { ok: false, error: `Unknown font theme: ${update.font}` }
  }
  if (update.color && !(update.color in COLOR_THEMES)) {
    return { ok: false, error: `Unknown color theme: ${update.color}` }
  }
  if (update.radius && !(update.radius in RADIUS_THEMES)) {
    return { ok: false, error: `Unknown radius theme: ${update.radius}` }
  }
  if (update.agent && !(update.agent in AGENT_THEMES)) {
    return { ok: false, error: `Unknown agent theme: ${update.agent}` }
  }

  const font = update.font as FontTheme | undefined
  const color = update.color as ColorTheme | undefined
  const radius = update.radius as RadiusTheme | undefined
  const agent = update.agent as AgentTheme | undefined
  const theme = resolveWorkspaceTheme({
    ...current,
    ...(font ? { font } : {}),
    ...(color ? { color } : {}),
    ...(radius ? { radius } : {}),
    ...(agent ? { agent } : {})
  })

  return {
    ok: true,
    theme,
    applied: {
      ...(font ? { font } : {}),
      ...(color ? { color } : {}),
      ...(radius ? { radius } : {}),
      ...(agent ? { agent } : {})
    }
  }
}
