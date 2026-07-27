import { describe, expect, test } from 'bun:test'

import { canSubmitComposerAction } from '@/client/components/shared/Composer'
import { appletSendBlockedReason } from '@/client/features/chat/useAppletChatMessage'

// An applet message must not start a run the composer's own send button would
// have refused — including while the availability query is still in flight,
// where `unavailableReason` is `undefined` rather than a reason string.
describe('appletSendBlockedReason', () => {
  test('a resolved-available workspace sends', () => {
    expect(appletSendBlockedReason(null)).toBeNull()
  })

  test('a known reason blocks and is quoted back for the journal', () => {
    expect(appletSendBlockedReason('claude is not installed')).toContain('claude is not installed')
  })

  test('an unresolved availability query blocks', () => {
    expect(appletSendBlockedReason(undefined)).toBe(
      "this workspace's agent availability has not resolved yet"
    )
  })

  test('agrees with the composer button on every availability state', () => {
    for (const reason of [null, undefined, 'claude is not installed']) {
      const composerWouldSend = canSubmitComposerAction(true, false, reason)
      expect(appletSendBlockedReason(reason) === null).toBe(composerWouldSend)
    }
  })
})
