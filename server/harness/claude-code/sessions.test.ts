import { describe, expect, test } from 'bun:test'

import { claudeSessionSummary } from './sessions'

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

  test('uses filenames for an attachment-only fallback', () => {
    expect(
      claudeSessionSummary({
        summary: '(see attached files) chart.png, notes.pdf',
        firstPrompt: '(see attached files) chart.png, notes.pdf'
      })
    ).toBe('chart.png, notes.pdf')
  })
})
