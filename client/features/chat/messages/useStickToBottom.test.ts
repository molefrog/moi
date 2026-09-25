import { describe, expect, test } from 'bun:test'

import { nextPinned } from './useStickToBottom'

describe('chat scroll pinning', () => {
  test('reaching the bottom always pins', () => {
    expect(nextPinned(false, 900, 1000, 0)).toBe(true)
    expect(nextPinned(false, 1000, 990, 40)).toBe(true)
  })

  test('scrolling up to older content un-pins', () => {
    expect(nextPinned(true, 1000, 700, 300)).toBe(false)
  })

  // After a send the content grows between a programmatic scroll and its
  // event: the event lands far from the new bottom but did not move up.
  test('a late event from a downward scroll keeps the pin', () => {
    expect(nextPinned(true, 800, 1000, 240)).toBe(true)
    expect(nextPinned(true, 1000, 1000, 240)).toBe(true)
  })

  test('scrolling down short of the bottom stays un-pinned', () => {
    expect(nextPinned(false, 500, 700, 300)).toBe(false)
  })
})
