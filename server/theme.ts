import { COLOR_THEMES, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme, WorkspaceLayout } from '@/lib/types'

type ThemeShape = NonNullable<WorkspaceLayout['theme']>

export type ThemeUpdate = { font?: string; color?: string }
export type ThemeUpdateResult =
  | { ok: true; theme: ThemeShape; applied: { font?: FontTheme; color?: ColorTheme } }
  | { ok: false; error: string }

// Pure merge + validation for a theme update. Spreads the existing theme so
// setting one axis never wipes the other. 'default' color is stored as
// `undefined` bg/fg, which JSON.stringify drops on save.
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

  const theme: ThemeShape = {
    ...current,
    font: (update.font as FontTheme) ?? current?.font ?? 'default'
  }

  if (update.color) {
    const preset = COLOR_THEMES[update.color as ColorTheme]
    theme.background = preset.background
    theme.foreground = preset.foreground
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

// Reverse-lookup: resolve stored bg/fg to a preset key, or null for custom colors.
export function matchColorTheme(bg: string | undefined, fg: string | undefined): ColorTheme | null {
  for (const [key, preset] of Object.entries(COLOR_THEMES) as [
    ColorTheme,
    (typeof COLOR_THEMES)[ColorTheme]
  ][]) {
    if (preset.background === bg && preset.foreground === fg) return key
  }
  return null
}
