import { describe, expect, test } from 'bun:test'

import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  FONT_THEMES,
  RADIUS_THEMES,
  deriveThemeColors
} from '@/lib/themes'

import { getWorkspaceThemeStyle } from './workspace-theme'

describe('getWorkspaceThemeStyle', () => {
  test('uses the default workspace theme variables', () => {
    const style = getWorkspaceThemeStyle(undefined)

    expect(style).toMatchObject({
      '--sans': FONT_THEMES.default.sans,
      '--mono': FONT_THEMES.default.mono,
      '--radius': RADIUS_THEMES.rounded.radius
    })
    expect(style['--primary']).toBeUndefined()
  })

  test('combines selected font and color variables', () => {
    const primary = COLOR_THEMES.paper.primary
    if (!primary) throw new Error('expected paper primary')
    const colors = deriveThemeColors(primary)
    const style = getWorkspaceThemeStyle({
      font: 'blobby',
      color: 'paper',
      radius: 'squishy'
    })

    expect(style).toMatchObject({
      '--sans': FONT_THEMES.blobby.sans,
      '--mono': FONT_THEMES.blobby.mono,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground,
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--accent': colors.accent,
      '--accent-foreground': colors.accentForeground,
      '--border': colors.border,
      '--radius': RADIUS_THEMES.squishy.radius
    })
  })

  test('applies the swapped color derivation to a widget block', () => {
    const primary = COLOR_THEMES.paper.primary
    if (!primary) throw new Error('expected paper primary')
    const colors = deriveThemeColors(primary, 'widget')

    expect(
      getWorkspaceThemeStyle({ font: 'default', color: 'paper', radius: 'rounded' }, 'widget')
    ).toMatchObject({
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground,
      '--muted': colors.muted,
      '--muted-foreground': colors.mutedForeground,
      '--accent': colors.accent,
      '--accent-foreground': colors.accentForeground,
      '--border': colors.border
    })
  })

  test('uses the root primary source for the default widget theme', () => {
    const colors = deriveThemeColors(DEFAULT_PRIMARY_COLOR, 'widget')

    expect(getWorkspaceThemeStyle(undefined, 'widget')).toMatchObject({
      '--background': colors.background,
      '--foreground': colors.foreground,
      '--primary': colors.primary,
      '--primary-foreground': colors.primaryForeground
    })
  })

  test('loads the configured geometric mono family', () => {
    expect(FONT_THEMES.geometric.googleFontsQuery).toContain('Geist+Mono')
  })
})
