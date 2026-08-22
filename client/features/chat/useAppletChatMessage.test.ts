import { describe, expect, test } from 'bun:test'

import { canSubmitComposerAction } from '@/client/components/shared/Composer'
import { appletSendBlockedReason } from '@/client/features/chat/useAppletChatMessage'
import type { AgentAvailability } from '@/client/lib/agent-availability'

// An applet message must not start a run the composer's own send button would
// have refused, including while the availability query is still in flight.
describe('appletSendBlockedReason', () => {
  test('a resolved-available workspace sends', () => {
    expect(appletSendBlockedReason({ status: 'available' })).toBeNull()
  })

  test('an unavailable workspace is reported without server details', () => {
    expect(appletSendBlockedReason({ status: 'unavailable', reason: 'Runtime missing' })).toBe(
      "this workspace's agent is unavailable"
    )
  })

  test('reports disconnected and login-required workspaces precisely', () => {
    expect(appletSendBlockedReason({ status: 'disconnected' })).toBe(
      'this workspace is disconnected from moi'
    )
    expect(
      appletSendBlockedReason({
        status: 'login-required',
        reason: 'Sign in'
      })
    ).toBe("this workspace's agent needs a login")
  })

  test('an unresolved availability query blocks', () => {
    expect(appletSendBlockedReason({ status: 'checking' })).toBe(
      "this workspace's agent availability has not resolved yet"
    )
  })

  test('agrees with the composer button on every availability state', () => {
    const states: AgentAvailability[] = [
      { status: 'available' },
      { status: 'checking' },
      { status: 'disconnected' },
      {
        status: 'login-required',
        reason: 'Sign in'
      },
      { status: 'unavailable', reason: 'Runtime missing' }
    ]
    for (const availability of states) {
      const composerWouldSend = canSubmitComposerAction(true, false, availability)
      expect(appletSendBlockedReason(availability) === null).toBe(composerWouldSend)
    }
  })
})
