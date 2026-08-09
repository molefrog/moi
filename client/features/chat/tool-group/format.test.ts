import { describe, expect, test } from 'bun:test'

import { formatDuration } from './format'

describe('formatDuration', () => {
  test('rounds sub-second durations up to a whole second', () => {
    expect(formatDuration(850)).toBe('1s')
    expect(formatDuration(514)).toBe('1s')
    // Never "0s": anything the backend bothered to report is at least a second.
    expect(formatDuration(12)).toBe('1s')
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
