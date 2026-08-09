// Unit tests for the gateway connect-options builder and the per-session
// subscription refcounting. Neither opens a socket — the options builder is
// pure and the refcount helpers operate on module state.
import { describe, expect, test } from 'bun:test'

import {
  OPENCLAW_CLIENT_CAPS,
  acquireSessionSubscriptionRef,
  gatewayClientBaseOptions,
  releaseSessionSubscriptionRef,
  sessionSubscriptionRefcount
} from './gateway'

describe('gatewayClientBaseOptions', () => {
  test('advertises the tool-events capability so the gateway sends session.tool frames', () => {
    const opts = gatewayClientBaseOptions('ws://127.0.0.1:18789', 'token')
    expect(opts.caps).toContain('tool-events')
  })

  test('the shared caps constant carries tool-events', () => {
    expect([...OPENCLAW_CLIENT_CAPS]).toContain('tool-events')
  })

  test('carries the url/token and pins wire protocol 4', () => {
    const opts = gatewayClientBaseOptions('ws://127.0.0.1:19001', 'secret')
    expect(opts.url).toBe('ws://127.0.0.1:19001')
    expect(opts.token).toBe('secret')
    expect(opts.role).toBe('operator')
    expect(opts.minProtocol).toBe(4)
    expect(opts.maxProtocol).toBe(4)
  })
})

describe('session subscription refcounts', () => {
  test('subscribes on the first holder and unsubscribes on the last', () => {
    const key = 'agent:test:refcount-a'
    expect(acquireSessionSubscriptionRef(key)).toBe(true) // 0 -> 1: first holder subscribes
    expect(acquireSessionSubscriptionRef(key)).toBe(false) // 1 -> 2: reuse, no wire call
    expect(sessionSubscriptionRefcount(key)).toBe(2)
    expect(releaseSessionSubscriptionRef(key)).toBe(false) // 2 -> 1: holders remain
    expect(releaseSessionSubscriptionRef(key)).toBe(true) // 1 -> 0: last holder unsubscribes
    expect(sessionSubscriptionRefcount(key)).toBe(0)
  })

  test('releasing an unheld key is a no-op, so a double release is safe', () => {
    const key = 'agent:test:refcount-b'
    acquireSessionSubscriptionRef(key)
    expect(releaseSessionSubscriptionRef(key)).toBe(true)
    expect(releaseSessionSubscriptionRef(key)).toBe(false) // already at 0
    expect(sessionSubscriptionRefcount(key)).toBe(0)
  })
})
