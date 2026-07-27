// A two-tier limiter for calls that are cheap to make and expensive to serve —
// an applet firing chat messages, a crash loop POSTing to the error journal.
// Both tiers are needed, and neither substitutes for the other:
//
//   • the per-key COOLDOWN collapses a repeat of the identical call (a render
//     loop, a double-mounted bundle) into one;
//   • the WINDOW cap bounds the total regardless of key, catching the loop that
//     varies its key every call and would sail past a cooldown.
//
// The verdict says which tier refused, so callers can explain the drop rather
// than swallow it. Recording is a side effect of an `ok`, so `admit` is called
// once per attempt, never speculatively.
//
// `now` is injectable for tests; production passes nothing and reads the clock.

export type RateLimitVerdict = 'ok' | 'cooldown' | 'window'

export type RateLimiterOptions = {
  // Minimum gap between two calls sharing a key.
  cooldownMs: number
  // Length of the window the cap applies to.
  windowMs: number
  // Admissions allowed per window, across all keys.
  maxPerWindow: number
  // Bound on remembered keys — half are dropped when exceeded, so a caller
  // whose keys are unbounded (message text, ids) can't grow the map forever.
  maxKeys?: number
  now?: () => number
}

export type RateLimiter = {
  admit: (key: string) => RateLimitVerdict
}

const DEFAULT_MAX_KEYS = 256

export function createRateLimiter({
  cooldownMs,
  windowMs,
  maxPerWindow,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now
}: RateLimiterOptions): RateLimiter {
  const lastAdmitted = new Map<string, number>()
  // Zero, not `now()`: the first call should open a fresh window rather than
  // land mid-way through one that started at construction time.
  let windowStart = 0
  let windowCount = 0

  return {
    admit(key) {
      const at = now()

      const last = lastAdmitted.get(key)
      if (last !== undefined && at - last < cooldownMs) return 'cooldown'

      if (at - windowStart >= windowMs) {
        windowStart = at
        windowCount = 0
      }
      if (windowCount >= maxPerWindow) return 'window'
      windowCount++

      lastAdmitted.set(key, at)
      // Pruning by insertion order, not recency: `set` on an existing key keeps
      // its original position. Good enough for a bound whose only job is to
      // stop unbounded growth — the cost of dropping a still-hot key is one
      // extra admitted call.
      if (lastAdmitted.size > maxKeys) {
        for (const stale of [...lastAdmitted.keys()].slice(0, Math.ceil(maxKeys / 2))) {
          lastAdmitted.delete(stale)
        }
      }
      return 'ok'
    }
  }
}
