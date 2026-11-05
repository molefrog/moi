import { describe, expect, test } from 'bun:test'

import {
  IDENTITY_ICON_CHOICES,
  IDENTITY_ICON_IDS,
  resolveIdentityIcon
} from './identity-icon-registry'

describe('identity icon registry', () => {
  test('has unique ids and resolves every choice', () => {
    expect(new Set(IDENTITY_ICON_IDS).size).toBe(IDENTITY_ICON_IDS.length)
    for (const choice of IDENTITY_ICON_CHOICES) {
      expect(resolveIdentityIcon(choice.id)).toBe(choice.Icon)
    }
  })

  test('returns null for missing and unknown icons', () => {
    expect(resolveIdentityIcon(undefined)).toBeNull()
    expect(resolveIdentityIcon('missing')).toBeNull()
  })

  test('reserves menu and settings icons for UI controls', () => {
    expect(resolveIdentityIcon('dots')).toBeNull()
    expect(resolveIdentityIcon('settings')).toBeNull()
  })
})
