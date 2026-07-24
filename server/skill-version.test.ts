import { describe, expect, test } from 'bun:test'

import { isBehind, isMinorBehind } from './skill-version'

describe('workspace skill version comparison', () => {
  test('does not update current or newer installed skills', () => {
    expect(isBehind('0.8.0', '0.8.0')).toBe(false)
    expect(isMinorBehind('0.9.0', '0.8.0')).toBe(false)
  })

  test('keeps patch-only gaps quiet', () => {
    expect(isBehind('0.8.0', '0.8.1')).toBe(true)
    expect(isMinorBehind('0.8.0', '0.8.1')).toBe(false)
  })

  test('surfaces minor and major gaps', () => {
    expect(isMinorBehind('0.7.1', '0.8.0')).toBe(true)
    expect(isMinorBehind('0.8.0', '1.0.0')).toBe(true)
  })

  test('surfaces missing or invalid installed versions', () => {
    expect(isMinorBehind(null, '0.8.0')).toBe(true)
    expect(isMinorBehind('invalid', '0.8.0')).toBe(true)
  })

  test('ignores missing or invalid bundled versions', () => {
    expect(isMinorBehind('0.8.0', null)).toBe(false)
    expect(isMinorBehind('0.8.0', 'invalid')).toBe(false)
  })
})
