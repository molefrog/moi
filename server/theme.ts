import { COLOR_THEMES, FONT_THEMES, RADIUS_THEMES, resolveWorkspaceTheme } from '@/lib/themes'
import type { ColorTheme, FontTheme, RadiusTheme, WorkspaceTheme } from '@/lib/types'

export type ThemeUpdate = { font?: string; color?: string; radius?: string }
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

  const font = update.font as FontTheme | undefined
  const color = update.color as ColorTheme | undefined
  const radius = update.radius as RadiusTheme | undefined
  const theme = resolveWorkspaceTheme({
    ...current,
    ...(font ? { font } : {}),
    ...(color ? { color } : {}),
    ...(radius ? { radius } : {})
  })

  return {
    ok: true,
    theme,
    applied: {
      ...(font ? { font } : {}),
      ...(color ? { color } : {}),
      ...(radius ? { radius } : {})
    }
  }
}
