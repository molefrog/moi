import { describe, expect, test } from 'bun:test'

import { canSubmitComposerAction, composerAvailabilityTooltip, focusComposer } from './Composer'
import type { WorkspaceAgentAvailability } from '@/client/lib/workspace-agent-availability'

const available: WorkspaceAgentAvailability = { status: 'available' }
const checking: WorkspaceAgentAvailability = { status: 'checking' }
const disconnected: WorkspaceAgentAvailability = { status: 'disconnected' }
const loginRequired: WorkspaceAgentAvailability = {
  status: 'login-required',
  reason: 'Sign in'
}
const unavailable: WorkspaceAgentAvailability = {
  status: 'unavailable',
  reason: 'Agent unavailable'
}

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
    expect(canSubmitComposerAction(true, false, available)).toBe(true)
  })

  test.each([
    { hasContent: false, busy: false, availability: available },
    { hasContent: true, busy: true, availability: available },
    { hasContent: true, busy: false, availability: checking },
    { hasContent: true, busy: false, availability: disconnected },
    { hasContent: true, busy: false, availability: loginRequired },
    { hasContent: true, busy: false, availability: unavailable }
  ])('blocks unavailable or incomplete composer actions', ({ hasContent, busy, availability }) => {
    expect(canSubmitComposerAction(hasContent, busy, availability)).toBe(false)
  })
})

describe('composerAvailabilityTooltip', () => {
  test('only shows while agent availability is checking', () => {
    expect(composerAvailabilityTooltip(checking)).toBe('Checking agent status…')
    expect(composerAvailabilityTooltip(disconnected)).toBeUndefined()
    expect(composerAvailabilityTooltip(loginRequired)).toBeUndefined()
    expect(composerAvailabilityTooltip(unavailable)).toBeUndefined()
    expect(composerAvailabilityTooltip(available)).toBeUndefined()
  })
})
