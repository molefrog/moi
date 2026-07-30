import { describe, expect, test } from 'bun:test'

import type { SessionInfo } from '@/lib/types'

import { groupSessionsByDate } from './ChatSelector'

function session(sessionId: string, summary: string, lastModified: string): SessionInfo {
  return {
    sessionId,
    summary,
    lastModified: new Date(lastModified).getTime()
  }
}

describe('groupSessionsByDate', () => {
  test('groups chats by local date and sorts newest first', () => {
    const now = new Date(2026, 6, 30, 12)
    const groups = groupSessionsByDate(
      [
        session('older-today', 'Earlier', new Date(2026, 6, 30, 8).toISOString()),
        session('older-day', 'Previous day', new Date(2026, 6, 24, 14).toISOString()),
        session('newer-today', 'Later', new Date(2026, 6, 30, 10).toISOString())
      ],
      now
    )

    expect(groups.map(group => group.label)).toEqual([
      'Today',
      new Date(2026, 6, 24).toLocaleDateString([], { month: 'short', day: 'numeric' })
    ])
    expect(groups[0]?.sessions.map(item => item.sessionId)).toEqual(['newer-today', 'older-today'])
  })

  test('includes the year for chats from an earlier year', () => {
    const now = new Date(2026, 6, 30, 12)
    const groups = groupSessionsByDate(
      [session('last-year', 'Last year', new Date(2025, 11, 12, 10).toISOString())],
      now
    )

    expect(groups[0]?.label).toBe(
      new Date(2025, 11, 12).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    )
  })

  test('uses friendly labels for the previous five calendar days', () => {
    const now = new Date(2026, 6, 30, 12)
    const groups = groupSessionsByDate(
      [
        session('today', 'Today', new Date(2026, 6, 30, 8).toISOString()),
        session('yesterday', 'Yesterday', new Date(2026, 6, 29, 23).toISOString()),
        session('two-days', 'Two days ago', new Date(2026, 6, 28, 10).toISOString()),
        session('five-days', 'Five days ago', new Date(2026, 6, 25, 10).toISOString()),
        session('six-days', 'Six days ago', new Date(2026, 6, 24, 10).toISOString())
      ],
      now
    )

    expect(groups.map(group => group.label)).toEqual([
      'Today',
      'Yesterday',
      '2 days ago',
      '5 days ago',
      new Date(2026, 6, 24).toLocaleDateString([], { month: 'short', day: 'numeric' })
    ])
  })
})
