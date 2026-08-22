import { describe, expect, test } from 'bun:test'

import { resolveAgentAvailability } from './agent-availability'

describe('resolveAgentAvailability', () => {
  test('adds only client lifecycle states to harness readiness', () => {
    expect(resolveAgentAvailability(undefined, false)).toEqual({ status: 'checking' })
    expect(resolveAgentAvailability({ status: 'available' }, false)).toEqual({
      status: 'available'
    })
    expect(
      resolveAgentAvailability({ status: 'login-required', reason: 'Sign in' }, false)
    ).toEqual({
      status: 'login-required',
      reason: 'Sign in'
    })
    expect(resolveAgentAvailability({ status: 'available' }, true)).toEqual({
      status: 'disconnected'
    })
  })
})
