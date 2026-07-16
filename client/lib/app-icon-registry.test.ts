import { describe, expect, test } from 'bun:test'

import { APP_ICON_CHOICES, APP_ICON_IDS, resolveAppIcon } from './app-icon-registry'

describe('app icon registry', () => {
  test('has unique ids and resolves every choice', () => {
    expect(new Set(APP_ICON_IDS).size).toBe(APP_ICON_IDS.length)
    for (const choice of APP_ICON_CHOICES) {
      expect(resolveAppIcon(choice.id)).toBe(choice.Icon)
    }
  })

  test('returns null for missing and unknown icons', () => {
    expect(resolveAppIcon(undefined)).toBeNull()
    expect(resolveAppIcon('missing')).toBeNull()
  })
})
