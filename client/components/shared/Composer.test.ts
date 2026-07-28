import { describe, expect, test } from 'bun:test'

import { canSubmitComposerAction, focusComposer } from './Composer'

test('focuses a composer with the caret after its draft', () => {
  let focused = false
  let selection = [-1, -1]

  focusComposer({
    value: 'Persisted draft',
    focus: () => {
      focused = true
    },
    setSelectionRange: (start, end) => {
      selection = [start ?? -1, end ?? -1]
    }
  })

  expect(focused).toBe(true)
  expect(selection).toEqual([15, 15])
})

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
