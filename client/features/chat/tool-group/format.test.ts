import { describe, expect, test } from 'bun:test'

import { formatDuration } from './format'

describe('formatDuration', () => {
  test('keeps sub-second durations in milliseconds', () => {
    expect(formatDuration(850)).toBe('850ms')
  })

  test('rounds seconds to an integer', () => {
    expect(formatDuration(3_200)).toBe('3s')
    expect(formatDuration(3_600)).toBe('4s')
  })

  test('carries rounded seconds into minutes', () => {
    expect(formatDuration(59_600)).toBe('1m')
    expect(formatDuration(65_400)).toBe('1m 5s')
  })
})
