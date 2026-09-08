import { describe, expect, test } from 'bun:test'

import { appletSelectorMatches, parseAppletSelector } from './applet-selector'

describe('applet selectors', () => {
  test('parses a kind or one applet with the same grammar', () => {
    expect(parseAppletSelector('views')).toEqual({ segment: 'views' })
    expect(parseAppletSelector('widgets/weather')).toEqual({
      segment: 'widgets',
      id: 'weather'
    })
  })

  test('rejects invalid kinds, ids, and extra path segments', () => {
    for (const value of ['view', 'views/', 'views/WordCards', 'views/word cards', 'views/a/b']) {
      expect(parseAppletSelector(value)).toBeNull()
    }
  })

  test('matches a whole kind or one id', () => {
    expect(appletSelectorMatches('views', 'views', 'orders')).toBe(true)
    expect(appletSelectorMatches('views/orders', 'views', 'orders')).toBe(true)
    expect(appletSelectorMatches('views/orders', 'views', 'other')).toBe(false)
    expect(appletSelectorMatches('views/orders', 'widgets', 'orders')).toBe(false)
  })
})
