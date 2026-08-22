import { describe, expect, test } from 'bun:test'

import { resolveWorkspaceAgentAvailability } from './workspace-agent-availability'

describe('resolveWorkspaceAgentAvailability', () => {
  test('adds only client lifecycle states to harness readiness', () => {
    expect(resolveWorkspaceAgentAvailability(undefined, false)).toEqual({ status: 'checking' })
    expect(resolveWorkspaceAgentAvailability({ status: 'available' }, false)).toEqual({
      status: 'available'
    })
    expect(
      resolveWorkspaceAgentAvailability({ status: 'login-required', reason: 'Sign in' }, false)
    ).toEqual({
      status: 'login-required',
      reason: 'Sign in'
    })
    expect(resolveWorkspaceAgentAvailability({ status: 'available' }, true)).toEqual({
      status: 'disconnected'
    })
  })
})
