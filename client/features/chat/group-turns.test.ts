import { describe, expect, test } from 'bun:test'

import { appendPreviewTurn, groupTurns } from '@/client/features/chat/group-turns'
import type { Part, Turn } from '@/lib/types'

const userTurn = (id: string, timestamp?: string): Turn => ({
  id,
  role: 'user',
  origin: { kind: 'user-input' },
  parts: [{ type: 'text', text: id }],
  timestamp
})

const assistantTurn = (id: string, parts: Part[], timestamp?: string): Turn => ({
  id,
  role: 'assistant',
  origin: { kind: 'user-input' },
  parts,
  timestamp
})

describe('groupTurns', () => {
  test('preview updates preserve completed row identities and duration', () => {
    const turns = [
      userTurn('user-1', '2026-08-06T10:00:00.000Z'),
      assistantTurn('work-1', [{ type: 'reasoning', text: 'Checking' }]),
      assistantTurn('answer-1', [{ type: 'text', text: 'Done' }], '2026-08-06T10:00:10.000Z'),
      userTurn('user-2'),
      assistantTurn('work-2', [{ type: 'reasoning', text: 'Thinking' }])
    ]
    const saved = groupTurns(turns)
    const preview = assistantTurn('preview', [{ type: 'text', text: 'Hello' }])
    const first = appendPreviewTurn(saved, preview)
    const second = appendPreviewTurn(saved, {
      ...preview,
      parts: [{ type: 'text', text: 'Hello world' }]
    })
    expect(first).toEqual(groupTurns([...turns, preview]))
    for (let i = 0; i < saved.length - 1; i++) {
      expect(first[i]).toBe(saved[i])
      expect(second[i]).toBe(saved[i])
    }
    expect(second.at(-1)).not.toBe(first.at(-1))
    expect(saved[1].meta?.durationMs).toBe(10_000)
    expect(saved.at(-1)?.parts).toHaveLength(1)
    expect(appendPreviewTurn(saved, null)).toBe(saved)
  })

  test('a preview after a user turn appends without changing saved rows', () => {
    const user = userTurn('user')
    const preview = assistantTurn('preview', [{ type: 'reasoning', text: 'Thinking' }])
    expect(appendPreviewTurn([], preview)).toEqual([preview])
    const grouped = appendPreviewTurn([user], preview)
    expect(grouped).toEqual([user, preview])
    expect(grouped[0]).toBe(user)
  })

  test('merges consecutive assistant messages into one stable run', () => {
    const grouped = groupTurns([
      userTurn('user', '2026-08-06T10:00:00.000Z'),
      assistantTurn('work', [{ type: 'reasoning', text: 'Checking' }], '2026-08-06T10:00:10.000Z'),
      assistantTurn('answer', [{ type: 'text', text: 'Done' }], '2026-08-06T10:01:35.000Z')
    ])

    expect(grouped).toHaveLength(2)
    expect(grouped[1].id).toBe('work')
    expect(grouped[1].parts.map(part => part.type)).toEqual(['reasoning', 'text'])
    expect(grouped[1].timestamp).toBe('2026-08-06T10:01:35.000Z')
    expect(grouped[1].meta?.durationMs).toBe(95_000)
  })

  test('hidden turns neither render nor split an assistant run', () => {
    const hidden: Turn = {
      id: 'hidden',
      role: 'user',
      origin: { kind: 'synthetic', reason: 'system-reminder' },
      parts: [{ type: 'text', text: 'hidden' }]
    }
    const grouped = groupTurns([
      userTurn('user'),
      assistantTurn('work', [{ type: 'reasoning', text: 'Checking' }]),
      hidden,
      assistantTurn('answer', [{ type: 'text', text: 'Done' }])
    ])

    expect(grouped.map(turn => turn.id)).toEqual(['user', 'work'])
    expect(grouped[1].parts).toHaveLength(2)
  })

  test('a new visible user message starts a new assistant run', () => {
    const grouped = groupTurns([
      userTurn('user-1'),
      assistantTurn('answer-1', [{ type: 'text', text: 'One' }]),
      userTurn('user-2'),
      assistantTurn('answer-2', [{ type: 'text', text: 'Two' }])
    ])

    expect(grouped.map(turn => turn.id)).toEqual(['user-1', 'answer-1', 'user-2', 'answer-2'])
  })
})

describe('agent run duration', () => {
  test('uses Codex native duration when transcript timestamps are absent', () => {
    const answer: Turn = {
      ...assistantTurn('answer', [{ type: 'text', text: 'Done' }]),
      meta: { durationMs: 12_000 }
    }
    expect(groupTurns([userTurn('user'), answer])[1].meta?.durationMs).toBe(12_000)
  })

  test('returns undefined when no valid duration is available', () => {
    const grouped = groupTurns([
      userTurn('user'),
      assistantTurn('answer', [{ type: 'text', text: 'Done' }])
    ])
    expect(grouped[1].meta?.durationMs).toBeUndefined()
  })
})
