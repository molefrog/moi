import { describe, expect, test } from 'bun:test'

import {
  canSubmitComposerAction,
  type ComposerAvailability
} from '@/client/components/shared/Composer'
import { appletSendBlockedReason } from '@/client/features/chat/useAppletChatMessage'

// An applet message must not start a run the composer's own send button would
// have refused, including while the availability query is still in flight.
describe('appletSendBlockedReason', () => {
  test('a resolved-available workspace sends', () => {
    expect(appletSendBlockedReason({ status: 'available' })).toBeNull()
  })

  test('a known reason blocks and is quoted back for the journal', () => {
    expect(
      appletSendBlockedReason({ status: 'unavailable', reason: 'claude is not installed' })
    ).toContain('claude is not installed')
  })

  test('an unresolved availability query blocks', () => {
    expect(appletSendBlockedReason({ status: 'checking' })).toBe(
      "this workspace's agent availability has not resolved yet"
    )
  })

  test('agrees with the composer button on every availability state', () => {
    const states: ComposerAvailability[] = [
      { status: 'available' },
      { status: 'checking' },
      { status: 'unavailable', reason: 'claude is not installed' }
    ]
    for (const availability of states) {
      const composerWouldSend = canSubmitComposerAction(true, false, availability)
      expect(appletSendBlockedReason(availability) === null).toBe(composerWouldSend)
    }
  })
})
