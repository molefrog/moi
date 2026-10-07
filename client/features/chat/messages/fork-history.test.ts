import { expect, test } from 'bun:test'
import { emptyViewState } from '@/lib/format'
import type { SessionRecord, Turn } from '@/lib/types'
import { visibleForkHistory } from './fork-history'

const fork: SessionRecord = {
  forkedFromSessionId: 'parent',
  forkedThroughMessageId: 'child-boundary',
  forkedNoticeIds: ['old-notice']
}
const turn = (id: string): Turn => ({
  id,
  role: 'user',
  origin: { kind: 'user-input' },
  parts: [{ type: 'text', text: id }],
  timestamp: '2026-09-17T12:00:00Z'
})

test('forked chat starts empty without changing its native history', () => {
  const view = { ...emptyViewState(), turns: [turn('inherited'), turn('child-boundary')] }
  expect(visibleForkHistory(view, fork).turns).toEqual([])
  expect(view.turns).toHaveLength(2)
})

test('shows only new turns after the child replay boundary', () => {
  const view = {
    ...emptyViewState(),
    turns: [turn('inherited'), turn('child-boundary'), turn('new')]
  }
  expect(visibleForkHistory(view, fork).turns.map(turn => turn.id)).toEqual(['new'])
  expect(visibleForkHistory(view)).toBe(view)
})

test('missing boundary in the loaded transcript shows its full history', () => {
  const view = { ...emptyViewState(), turns: [turn('inherited')] }
  expect(visibleForkHistory(view, fork)).toBe(view)
})

test('an empty source needs no synthetic first message', () => {
  const emptyFork: SessionRecord = { forkedFromSessionId: 'parent' }
  expect(visibleForkHistory(emptyViewState(), emptyFork).turns).toEqual([])
  const view = { ...emptyViewState(), turns: [turn('new')] }
  expect(visibleForkHistory(view, emptyFork)).toBe(view)
})

test('a failed cutoff read leaves inherited history visible', () => {
  const view = { ...emptyViewState(), turns: [turn('inherited')] }
  expect(visibleForkHistory(view, { forkedFromSessionId: 'parent' })).toBe(view)
})

test('hides inherited notices and keeps new ones', () => {
  const view = {
    ...emptyViewState(),
    turns: [turn('child-boundary')],
    notices: ['old-notice', 'new-notice'].map(id => ({
      id,
      kind: 'compact' as const,
      at: '2026-09-17T12:00:00Z'
    }))
  }
  expect(visibleForkHistory(view, fork).notices.map(notice => notice.id)).toEqual(['new-notice'])
})
