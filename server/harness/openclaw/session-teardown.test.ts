// Teardown of a live OpenClaw session record: it leaves the live map, releases
// its gateway subscription exactly once, and a second teardown is a no-op. Runs
// without a gateway — teardown drops the demand refcount directly when no live
// handle exists (createOpenClawSessionForTest seeds the record; the refcount is
// pre-acquired to stand in for the first-holder subscribe).
import { describe, expect, test } from 'bun:test'

import { acquireSessionSubscriptionRef, sessionSubscriptionRefcount } from './gateway'
import {
  createOpenClawSessionForTest,
  hasOpenClawLiveSessionForTest,
  teardownOpenClawSession
} from './session'

describe('teardownOpenClawSession', () => {
  test('removes the record and releases the subscription once; double teardown is safe', () => {
    const sessionKey = 'agent:teardown:main'
    // Stand in for the record having subscribed the key as the first holder.
    acquireSessionSubscriptionRef(sessionKey)
    expect(sessionSubscriptionRefcount(sessionKey)).toBe(1)

    const rec = createOpenClawSessionForTest({
      workspaceId: 'ws-teardown',
      sessionId: 'session-1',
      sessionKey
    })
    expect(hasOpenClawLiveSessionForTest('ws-teardown', 'session-1')).toBe(true)

    teardownOpenClawSession(rec)
    expect(hasOpenClawLiveSessionForTest('ws-teardown', 'session-1')).toBe(false)
    expect(sessionSubscriptionRefcount(sessionKey)).toBe(0) // released exactly once

    // Idempotent: the record is already gone, so a second teardown neither
    // throws nor double-releases the subscription.
    expect(() => teardownOpenClawSession(rec)).not.toThrow()
    expect(sessionSubscriptionRefcount(sessionKey)).toBe(0)
  })

  test('a distinct held key is untouched when another session tears down', () => {
    const keptKey = 'agent:teardown:kept'
    acquireSessionSubscriptionRef(keptKey)
    const rec = createOpenClawSessionForTest({
      workspaceId: 'ws-teardown',
      sessionId: 'session-2',
      sessionKey: 'agent:teardown:other'
    })
    acquireSessionSubscriptionRef('agent:teardown:other')

    teardownOpenClawSession(rec)
    expect(hasOpenClawLiveSessionForTest('ws-teardown', 'session-2')).toBe(false)
    expect(sessionSubscriptionRefcount('agent:teardown:other')).toBe(0)
    expect(sessionSubscriptionRefcount(keptKey)).toBe(1) // an unrelated hold survives
  })
})
