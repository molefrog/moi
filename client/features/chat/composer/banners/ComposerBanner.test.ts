import { describe, expect, test } from 'bun:test'

import type { ComposerBanner } from './ComposerBanner'
import { resolveComposerBanner } from './ComposerBanner'

const agentUnavailable: ComposerBanner = {
  tone: 'default',
  content: 'Agent unavailable'
}
const chatError: ComposerBanner = {
  tone: 'error',
  content: 'Chat error'
}
const skillUpdate: ComposerBanner = {
  tone: 'default',
  content: 'Skill update'
}

describe('resolveComposerBanner', () => {
  test('prioritizes agent availability, then chat errors, then skill updates', () => {
    expect(resolveComposerBanner({ agentUnavailable, chatError, skillUpdate })).toBe(
      agentUnavailable
    )
    expect(resolveComposerBanner({ chatError, skillUpdate })).toBe(chatError)
    expect(resolveComposerBanner({ skillUpdate })).toBe(skillUpdate)
  })

  test('returns no banner without a candidate', () => {
    expect(resolveComposerBanner({})).toBeUndefined()
  })
})
