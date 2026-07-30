import { describe, expect, test } from 'bun:test'

import {
  MOI_ARCHIVED_SESSION_TAG,
  canReplaceClaudeSessionTitle,
  claudeSessionSummary,
  visibleClaudeSessions
} from './sessions'

describe('claudeSessionSummary', () => {
  test('formats a raw first-prompt fallback', () => {
    expect(
      claudeSessionSummary({
        summary: '**Build   the dashboard**',
        firstPrompt: '**Build   the dashboard**'
      })
    ).toBe('Build the dashboard')
  })

  test('keeps native and custom titles unchanged', () => {
    expect(
      claudeSessionSummary({
        summary: 'Dashboard data cleanup',
        customTitle: 'Dashboard data cleanup',
        firstPrompt: 'Can you clean up this dashboard?'
      })
    ).toBe('Dashboard data cleanup')
    expect(
      claudeSessionSummary({
        summary: 'My custom title',
        customTitle: 'My custom title',
        firstPrompt: 'Original message'
      })
    ).toBe('My custom title')
  })

  test('does not mistake the latest prompt for a generated title', () => {
    expect(
      claudeSessionSummary({
        summary: 'One more follow-up',
        firstPrompt: 'Build a weather dashboard'
      })
    ).toBe('Build a weather dashboard')
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

describe('canReplaceClaudeSessionTitle', () => {
  test('allows replacing the raw first-message fallback', () => {
    expect(
      canReplaceClaudeSessionTitle({
        summary: 'Build a customer dashboard with useful charts',
        firstPrompt: 'Build a customer dashboard with useful charts'
      })
    ).toBe(true)
  })

  test('allows replacing provider summaries until a persisted title exists', () => {
    expect(
      canReplaceClaudeSessionTitle({
        summary: 'Customer dashboard',
        firstPrompt: 'Build a customer dashboard with useful charts'
      })
    ).toBe(true)
  })

  test('preserves persisted generated and custom titles', () => {
    expect(
      canReplaceClaudeSessionTitle({
        summary: 'My custom title',
        customTitle: 'My custom title',
        firstPrompt: 'Build a customer dashboard with useful charts'
      })
    ).toBe(false)
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
