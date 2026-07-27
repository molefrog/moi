import { describe, expect, test } from 'bun:test'

import { COLOR_THEMES, FONT_THEMES } from '@/lib/themes'

import { getWorkspaceThemeStyle } from './workspace-theme'

describe('getWorkspaceThemeStyle', () => {
  test('uses the default workspace font variables', () => {
    expect(getWorkspaceThemeStyle(undefined)).toMatchObject({
      '--sans': FONT_THEMES.default.sans,
      '--mono': FONT_THEMES.default.mono
    })
  })

  test('combines selected font and color variables', () => {
    const style = getWorkspaceThemeStyle({
      font: 'blobby',
      ...COLOR_THEMES.paper
    })

    expect(style).toMatchObject({
      '--sans': FONT_THEMES.blobby.sans,
      '--mono': FONT_THEMES.blobby.mono,
      '--background': COLOR_THEMES.paper.background,
      '--foreground': COLOR_THEMES.paper.foreground
    })
  })

  test('loads the configured geometric mono family', () => {
    expect(FONT_THEMES.geometric.googleFontsQuery).toContain('Geist+Mono')
  })
})
