import { COLOR_THEMES, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme, WorkspaceLayout } from '@/lib/types'

type ThemeShape = NonNullable<WorkspaceLayout['theme']>

export type ThemeUpdate = { font?: string; color?: string }
export type ThemeUpdateResult =
  | { ok: true; theme: ThemeShape; applied: { font?: FontTheme; color?: ColorTheme } }
  | { ok: false; error: string }

// Pure merge + validation for a theme update. The workspace stores only the
// selected font and primary; all other color tokens are derived at runtime.
export function applyThemeUpdate(
  current: WorkspaceLayout['theme'],
  update: ThemeUpdate
): ThemeUpdateResult {
  if (update.font && !(update.font in FONT_THEMES)) {
    return { ok: false, error: `Unknown font theme: ${update.font}` }
  }
  if (update.color && !(update.color in COLOR_THEMES)) {
    return { ok: false, error: `Unknown color theme: ${update.color}` }
  }

  const primary = update.color ? COLOR_THEMES[update.color as ColorTheme].primary : current?.primary
  const theme: ThemeShape = {
    font: (update.font as FontTheme) ?? current?.font ?? 'default',
    ...(primary ? { primary } : {})
  }

  return {
    ok: true,
    theme,
    applied: {
      ...(update.font ? { font: update.font as FontTheme } : {}),
      ...(update.color ? { color: update.color as ColorTheme } : {})
    }
  }
}

// Reverse-lookup: resolve the stored primary to a preset key, or null for custom colors.
export function matchColorTheme(primary: string | undefined): ColorTheme | null {
  for (const [key, preset] of Object.entries(COLOR_THEMES) as [
    ColorTheme,
    (typeof COLOR_THEMES)[ColorTheme]
  ][]) {
    if (preset.primary === primary) return key
  }
  return null
}
