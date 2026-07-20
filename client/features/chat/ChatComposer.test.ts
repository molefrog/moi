import { describe, expect, test } from 'bun:test'

import { canSendChatMessage } from './ChatComposer'

describe('canSendChatMessage', () => {
  test('allows a ready message while the provider is available', () => {
    expect(canSendChatMessage(true, false, null)).toBe(true)
  })

  test.each([
    { hasContent: false, uploading: false, unavailableReason: undefined },
    { hasContent: true, uploading: true, unavailableReason: undefined },
    { hasContent: true, uploading: false, unavailableReason: undefined },
    {
      hasContent: true,
      uploading: false,
      unavailableReason:
        'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    }
  ])(
    'blocks submission for unavailable or incomplete messages',
    ({ hasContent, uploading, unavailableReason }) => {
      expect(canSendChatMessage(hasContent, uploading, unavailableReason)).toBe(false)
    }
  )
})
