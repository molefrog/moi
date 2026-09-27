import { describe, expect, test } from 'bun:test'

import type { SessionInfo } from '@/lib/types'

import { removeArchivedSession } from './api'
import { groupSessionsByDate, sessionBadge } from './ChatSelector'

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

describe('sessionBadge', () => {
  const base = session('s1', 'A chat', new Date(2026, 6, 30, 8).toISOString())

  test('cron and subagent flavors badge as themselves', () => {
    expect(sessionBadge({ ...base, flavor: 'cron' })).toBe('cron')
    expect(sessionBadge({ ...base, flavor: 'subagent' })).toBe('subagent')
  })

  test('flavor wins over origin', () => {
    expect(sessionBadge({ ...base, flavor: 'cron', origin: { provider: 'telegram' } })).toBe('cron')
  })

  test('origin badges as the provider name lowercase', () => {
    expect(sessionBadge({ ...base, origin: { provider: 'IRC' } })).toBe('irc')
    expect(
      sessionBadge({ ...base, flavor: 'chat', origin: { provider: 'telegram', label: '#moi' } })
    ).toBe('telegram')
  })

  test('plain app chats get no badge', () => {
    expect(sessionBadge(base)).toBe(null)
    expect(sessionBadge({ ...base, flavor: 'chat' })).toBe(null)
    expect(sessionBadge({ ...base, origin: { provider: '  ' } })).toBe(null)
  })
})

test('overlapping archive completions remove every successful chat', () => {
  let sessions: SessionInfo[] | undefined = [
    session('first', 'First', new Date(2026, 6, 30, 8).toISOString()),
    session('second', 'Second', new Date(2026, 6, 30, 9).toISOString()),
    session('third', 'Third', new Date(2026, 6, 30, 10).toISOString())
  ]

  sessions = removeArchivedSession(sessions, 'second')
  sessions = removeArchivedSession(sessions, 'first')

  expect(sessions?.map(item => item.sessionId)).toEqual(['third'])
})
