import { describe, expect, test } from 'bun:test'

import { canSubmitComposerAction } from './Composer'

describe('canSubmitComposerAction', () => {
  test('allows complete input while the provider is available', () => {
    expect(canSubmitComposerAction(true, false, null)).toBe(true)
  })

  test.each([
    { hasContent: false, busy: false, unavailableReason: null },
    { hasContent: true, busy: true, unavailableReason: null },
    { hasContent: true, busy: false, unavailableReason: undefined },
    {
      hasContent: true,
      busy: false,
      unavailableReason:
        'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    }
  ])(
    'blocks unavailable or incomplete composer actions',
    ({ hasContent, busy, unavailableReason }) => {
      expect(canSubmitComposerAction(hasContent, busy, unavailableReason)).toBe(false)
    }
  )
})
