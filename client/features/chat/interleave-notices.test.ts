import { describe, expect, test } from 'bun:test'

import { chatNoticeLabel, interleaveNotices } from '@/client/features/chat/interleave-notices'
import type { SystemNotice, Turn } from '@/lib/types'

function turn(id: string, timestamp?: string): Turn {
  return {
    id,
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts: [{ type: 'text', text: id }],
    ...(timestamp ? { timestamp } : {})
  }
}

function compact(id: string, at: string): SystemNotice {
  return { id, kind: 'compact', at }
}

function keys(items: ReturnType<typeof interleaveNotices>): string[] {
  return items.map(item => (item.kind === 'turn' ? item.turn.id : `notice:${item.notice.id}`))
}

describe('chatNoticeLabel', () => {
  test('copy for compact and model-change', () => {
    expect(chatNoticeLabel(compact('n1', 't'))).toBe('Context compacted')
    expect(
      chatNoticeLabel({ id: 'n2', kind: 'model-change', at: 't', model: 'claude-opus-4-8' })
    ).toBe('Model changed to claude-opus-4-8')
    expect(
      chatNoticeLabel({
        id: 'n3',
        kind: 'model-change',
        at: 't',
        model: 'gpt-6',
        prev: 'claude-opus-4-8'
      })
    ).toBe('Model changed to gpt-6 (was claude-opus-4-8)')
  })

  test('every other kind is skipped', () => {
    const skipped: SystemNotice[] = [
      { id: 'a', kind: 'rate-limit', at: 't' },
      { id: 'b', kind: 'api-retry', at: 't', attempt: 1, maxRetries: 3, delayMs: 100 },
      {
        id: 'c',
        kind: 'hook',
        at: 't',
        hookId: 'h',
        hookName: 'h',
        event: 'e',
        status: 'started'
      },
      { id: 'd', kind: 'session-state', at: 't', state: 'idle' },
      { id: 'e', kind: 'files-persisted', at: 't', files: [], failed: [] },
      { id: 'f', kind: 'elicitation', at: 't', server: 's', elicitationId: 'e1' }
    ]
    for (const notice of skipped) expect(chatNoticeLabel(notice)).toBe(null)
  })
})

describe('interleaveNotices', () => {
  const t1 = turn('t1', '2026-08-04T10:00:00Z')
  const t2 = turn('t2', '2026-08-04T11:00:00Z')
  const t3 = turn('t3', '2026-08-04T12:00:00Z')

  test('no renderable notices → turns pass through', () => {
    const items = interleaveNotices(
      [t1, t2],
      [{ id: 'x', kind: 'rate-limit', at: '2026-08-04T10:30:00Z' }]
    )
    expect(keys(items)).toEqual(['t1', 't2'])
  })

  test('a notice lands between the turns around its timestamp', () => {
    const items = interleaveNotices([t1, t2, t3], [compact('n1', '2026-08-04T10:30:00Z')])
    expect(keys(items)).toEqual(['t1', 'notice:n1', 't2', 't3'])
  })

  test('notices sort chronologically even when stored out of order', () => {
    const items = interleaveNotices(
      [t1, t2, t3],
      [compact('late', '2026-08-04T11:30:00Z'), compact('early', '2026-08-04T10:30:00Z')]
    )
    expect(keys(items)).toEqual(['t1', 'notice:early', 't2', 'notice:late', 't3'])
  })

  test('a notice newer than every turn goes after the last turn', () => {
    const items = interleaveNotices([t1, t2], [compact('n1', '2026-08-04T13:00:00Z')])
    expect(keys(items)).toEqual(['t1', 't2', 'notice:n1'])
  })

  test('a notice with an unparseable anchor goes after the last turn', () => {
    const items = interleaveNotices([t1, t2], [compact('n1', 'not-a-date')])
    expect(keys(items)).toEqual(['t1', 't2', 'notice:n1'])
  })

  test('undated turns inherit the previous turn time and never trail a notice', () => {
    // t2b has no timestamp: it inherits t1's 10:00, so the 10:30 notice still
    // lands after it only when a strictly newer turn appears.
    const items = interleaveNotices([t1, turn('t2b'), t3], [compact('n1', '2026-08-04T10:30:00Z')])
    expect(keys(items)).toEqual(['t1', 't2b', 'notice:n1', 't3'])
  })

  test('all turns undated → notices go after the last turn', () => {
    const items = interleaveNotices([turn('a'), turn('b')], [compact('n1', '2026-08-04T10:30:00Z')])
    expect(keys(items)).toEqual(['a', 'b', 'notice:n1'])
  })

  test('no turns → notices render alone', () => {
    const items = interleaveNotices([], [compact('n1', '2026-08-04T10:30:00Z')])
    expect(keys(items)).toEqual(['notice:n1'])
  })
})

test('a notice stamped with the turn timestamp renders before that turn', () => {
  const turns = [turn('t1', '2026-08-04T10:00:00.000Z'), turn('t2', '2026-08-04T10:05:00.000Z')]
  const items = interleaveNotices(turns, [compact('n1', '2026-08-04T10:05:00.000Z')])
  expect(keys(items)).toEqual(['t1', 'notice:n1', 't2'])
})
