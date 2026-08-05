import { describe, expect, test } from 'bun:test'

import { COLOR_THEMES, FONT_THEMES, RADIUS_THEMES, deriveThemeColors } from '@/lib/themes'

import { getWorkspaceThemeStyle } from './workspace-theme'

describe('getWorkspaceThemeStyle', () => {
  test('uses the default workspace theme variables', () => {
    expect(getWorkspaceThemeStyle(undefined)).toMatchObject({
      '--sans': FONT_THEMES.default.sans,
      '--mono': FONT_THEMES.default.mono,
      '--radius': RADIUS_THEMES.rounded.radius
    })
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
      '--radius': RADIUS_THEMES.squishy.radius
    })
  })

  test('loads the configured geometric mono family', () => {
    expect(FONT_THEMES.geometric.googleFontsQuery).toContain('Geist+Mono')
  })
})
