import { describe, expect, test } from 'bun:test'

import { MOI_ARCHIVED_SESSION_TAG, claudeSessionSummary, visibleClaudeSessions } from './sessions'

describe('claudeSessionSummary', () => {
  test('uses the SDK display summary unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: 'Dashboard data cleanup',
        firstPrompt: 'Can you clean up this dashboard?'
      })
    ).toBe('Dashboard data cleanup')
  })

  test('keeps custom titles unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: 'My custom title',
        customTitle: 'My custom title',
        firstPrompt: 'Original message'
      })
    ).toBe('My custom title')
  })

  test('keeps the SDK first-prompt fallback unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: '**Build   the dashboard**',
        firstPrompt: '**Build   the dashboard**'
      })
    ).toBe('**Build   the dashboard**')
  })

  test('uses filenames for an attachment-only fallback', () => {
    expect(
      claudeSessionSummary({
        summary: '(see attached files) chart.png, notes.pdf',
        firstPrompt: '(see attached files) chart.png, notes.pdf'
      })
    ).toBe('chart.png, notes.pdf')
  })
})

describe('visibleClaudeSessions', () => {
  test('excludes chats carrying the moi archive tag', () => {
    expect(
      visibleClaudeSessions([
        { sessionId: 'visible', tag: 'keep-me' },
        { sessionId: 'archived', tag: MOI_ARCHIVED_SESSION_TAG },
        { sessionId: 'untagged' }
      ]).map(session => session.sessionId)
    ).toEqual(['visible', 'untagged'])
  })
})
