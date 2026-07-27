import { describe, expect, test } from 'bun:test'

import { createRateLimiter } from './rate-limit'

// A controllable clock — the real one makes window expiry untestable without
// sleeping, and sleeping makes the suite slow and flaky.
function clock(start = 1_000) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

const LIMITS = { cooldownMs: 2_000, windowMs: 60_000, maxPerWindow: 3 }

describe('cooldown tier', () => {
  test('admits the first call and refuses an identical repeat', () => {
    const { now } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    expect(limiter.admit('a')).toBe('ok')
    expect(limiter.admit('a')).toBe('cooldown')
  })

  test('is per key — a different key is a different call', () => {
    const { now } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    expect(limiter.admit('a')).toBe('ok')
    expect(limiter.admit('b')).toBe('ok')
    expect(limiter.admit('a')).toBe('cooldown')
  })

  test('expires exactly at the cooldown boundary', () => {
    const { now, advance } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    expect(limiter.admit('a')).toBe('ok')
    advance(1_999)
    expect(limiter.admit('a')).toBe('cooldown')
    advance(1)
    expect(limiter.admit('a')).toBe('ok')
  })

  test('a refused call does not extend the cooldown', () => {
    const { now, advance } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    expect(limiter.admit('a')).toBe('ok')
    advance(1_500)
    expect(limiter.admit('a')).toBe('cooldown')
    // Measured from the last ADMITTED call, so the retry still lands at 2s.
    advance(500)
    expect(limiter.admit('a')).toBe('ok')
  })
})

describe('window tier', () => {
  test('caps distinct keys that would each pass the cooldown', () => {
    const { now } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    expect(['a', 'b', 'c', 'd', 'e'].map(k => limiter.admit(k))).toEqual([
      'ok',
      'ok',
      'ok',
      'window',
      'window'
    ])
  })

  test('the window reopens once it elapses', () => {
    const { now, advance } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    for (const k of ['a', 'b', 'c']) expect(limiter.admit(k)).toBe('ok')
    expect(limiter.admit('d')).toBe('window')

    advance(60_000)
    expect(limiter.admit('d')).toBe('ok')
  })

  test('refused calls do not count against the cap', () => {
    const { now } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    expect(limiter.admit('a')).toBe('ok')
    // Three cooldown refusals would exhaust a cap that counted attempts.
    for (let i = 0; i < 3; i++) expect(limiter.admit('a')).toBe('cooldown')
    expect(limiter.admit('b')).toBe('ok')
    expect(limiter.admit('c')).toBe('ok')
    expect(limiter.admit('d')).toBe('window')
  })

  test('the cooldown is checked first, so a repeat reads as a repeat', () => {
    const { now } = clock()
    const limiter = createRateLimiter({ ...LIMITS, now })

    for (const k of ['a', 'b', 'c']) expect(limiter.admit(k))
    // 'a' is both a repeat and over the cap; the verdict names the fix the
    // caller should suggest first.
    expect(limiter.admit('a')).toBe('cooldown')
  })
})

describe('key bound', () => {
  test('keeps admitting after pruning, and never grows without bound', () => {
    const { now, advance } = clock()
    const limiter = createRateLimiter({
      cooldownMs: 2_000,
      windowMs: 60_000,
      maxPerWindow: 1_000,
      maxKeys: 4,
      now
    })

    for (let i = 0; i < 50; i++) expect(limiter.admit(`k${i}`)).toBe('ok')
    // Pruning drops old keys, so a long-forgotten one is admitted again rather
    // than the map holding every key forever.
    advance(2_000)
    expect(limiter.admit('k0')).toBe('ok')
  })

  test('a key admitted moments ago survives long enough to still be refused', () => {
    const { now } = clock()
    const limiter = createRateLimiter({
      cooldownMs: 2_000,
      windowMs: 60_000,
      maxPerWindow: 1_000,
      maxKeys: 4,
      now
    })

    limiter.admit('hot')
    limiter.admit('a')
    expect(limiter.admit('hot')).toBe('cooldown')
  })
})
