import { describe, expect, test } from 'bun:test'

import type { Turn } from '@/lib/format'

import {
  AssistantTurnAccumulator,
  acpSessionToSessionInfo,
  acpToolCallToTurn,
  toolStatusToState
} from './adapter'

const SESSION = 'sess-1'

function toolCall(turn: Turn) {
  const part = turn.parts.find(p => p.type === 'tool-call')
  if (part?.type !== 'tool-call') throw new Error('expected a tool-call part')
  return part.call
}

describe('toolStatusToState', () => {
  test('maps terminal statuses', () => {
    expect(toolStatusToState('completed')).toBe('success')
    expect(toolStatusToState('failed')).toBe('error')
  })

  // ACP defaults an omitted status to `pending`, but a call we have been told
  // about has started — rendering it as pending shows no spinner.
  test('treats a missing or pending status as running', () => {
    expect(toolStatusToState(undefined)).toBe('running')
    expect(toolStatusToState('pending')).toBe('running')
    expect(toolStatusToState('in_progress')).toBe('running')
  })
})

describe('acpToolCallToTurn', () => {
  test('uses the display-ready title as the tool name', () => {
    const turn = acpToolCallToTurn({
      update: { toolCallId: 'tc-1', title: 'terminal: echo hi', kind: 'execute' },
      sessionId: SESSION,
      provider: 'hermes'
    })

    expect(turn.id).toBe(`${SESSION}:tool:tc-1`)
    expect(toolCall(turn)).toMatchObject({ name: 'terminal: echo hi', state: 'running' })
  })

  // Only the opening `tool_call` carries a title; the completing
  // `tool_call_update` carries kind + status + content. Without the carry-over
  // the card's label degrades from "terminal: echo hi" to "execute".
  test('keeps the established name when the update omits the title', () => {
    const started = acpToolCallToTurn({
      update: { toolCallId: 'tc-1', title: 'terminal: echo hi', kind: 'execute' },
      sessionId: SESSION,
      provider: 'hermes'
    })
    const completed = acpToolCallToTurn({
      update: {
        toolCallId: 'tc-1',
        kind: 'execute',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'hi' } }]
      },
      sessionId: SESSION,
      provider: 'hermes',
      previous: started
    })

    expect(completed.id).toBe(started.id)
    expect(toolCall(completed)).toMatchObject({ name: 'terminal: echo hi', state: 'success' })
    expect(toolCall(completed).output).toBe('hi')
  })

  test('falls back to the kind when nothing else is known', () => {
    const turn = acpToolCallToTurn({
      update: { toolCallId: 'tc-2', kind: 'read' },
      sessionId: SESSION,
      provider: 'hermes'
    })

    expect(toolCall(turn).name).toBe('read')
  })

  test('records locations and surfaces a failure as errorText', () => {
    const turn = acpToolCallToTurn({
      update: {
        toolCallId: 'tc-3',
        title: 'write: a.txt',
        kind: 'edit',
        status: 'failed',
        locations: [{ path: 'a.txt' }],
        content: [{ type: 'content', content: { type: 'text', text: 'permission denied' } }]
      },
      sessionId: SESSION,
      provider: 'hermes'
    })

    const call = toolCall(turn)
    expect(call.state).toBe('error')
    expect(call.errorText).toBe('permission denied')
    expect(call.sidecar).toEqual({ locations: ['a.txt'] })
  })

  test('keeps the original timestamp across updates', () => {
    const started = acpToolCallToTurn({
      update: { toolCallId: 'tc-4', title: 'read: a.txt' },
      sessionId: SESSION,
      provider: 'hermes',
      timestamp: '2026-01-01T00:00:00.000Z'
    })
    const completed = acpToolCallToTurn({
      update: { toolCallId: 'tc-4', status: 'completed' },
      sessionId: SESSION,
      provider: 'hermes',
      previous: started
    })

    expect(completed.timestamp).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('AssistantTurnAccumulator', () => {
  test('builds one turn from interleaved thought and text chunks', () => {
    const acc = new AssistantTurnAccumulator(SESSION, 'kimi', 'hermes')
    acc.append('reasoning', 'think')
    acc.append('reasoning', 'ing')
    acc.append('text', 'ans')
    acc.append('text', 'wer')

    const turn = acc.flush()
    expect(turn).not.toBeNull()
    expect(turn?.role).toBe('assistant')
    expect(turn?.parts).toEqual([
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text: 'answer' }
    ])
    expect(turn?.meta).toMatchObject({ model: 'kimi', provider: 'hermes' })
  })

  test('flushing an empty run emits nothing', () => {
    expect(new AssistantTurnAccumulator(SESSION).flush()).toBeNull()
  })

  // Consecutive runs must land under different ids or the second upserts over
  // the first and the transcript loses a message.
  test('advances the turn id per run', () => {
    const acc = new AssistantTurnAccumulator(SESSION)
    acc.append('text', 'one')
    const first = acc.flush()
    acc.append('text', 'two')
    const second = acc.flush()

    expect(first?.id).toBe(`${SESSION}:msg:0`)
    expect(second?.id).toBe(`${SESSION}:msg:1`)
  })

  // The preview is keyed by apiMessageId so the client can clear it the
  // instant the real turn lands.
  test('preview blocks are cumulative and match the turn id', () => {
    const acc = new AssistantTurnAccumulator(SESSION)
    acc.append('reasoning', 'why')
    acc.append('text', 'because')

    expect(acc.currentId).toBe(`${SESSION}:msg:0`)
    expect(acc.previewBlocks()).toEqual([
      { index: 0, kind: 'reasoning', text: 'why' },
      { index: 1, kind: 'text', text: 'because' }
    ])
    expect(acc.flush()?.meta?.apiMessageId).toBe(`${SESSION}:msg:0`)
  })

  test('folds end-of-turn meta into the final turn', () => {
    const acc = new AssistantTurnAccumulator(SESSION)
    acc.append('text', 'done')

    const turn = acc.flush({ stopReason: 'end_turn', usage: { totalTokens: 42 } })
    expect(turn?.meta).toMatchObject({ stopReason: 'end_turn', usage: { totalTokens: 42 } })
  })

  test('ignores empty deltas', () => {
    const acc = new AssistantTurnAccumulator(SESSION)
    acc.append('text', '')
    expect(acc.isOpen).toBe(false)
  })
})

describe('acpSessionToSessionInfo', () => {
  test('maps a listing row', () => {
    expect(
      acpSessionToSessionInfo({
        sessionId: 's1',
        title: 'Run echo and write a file',
        cwd: '/ws',
        updatedAt: '2026-08-09T12:00:00.000Z'
      })
    ).toEqual({
      sessionId: 's1',
      summary: 'Run echo and write a file',
      lastModified: Date.parse('2026-08-09T12:00:00.000Z'),
      cwd: '/ws'
    })
  })

  test('tolerates a missing title and an unparsable timestamp', () => {
    expect(acpSessionToSessionInfo({ sessionId: 's2', updatedAt: 'not-a-date' })).toEqual({
      sessionId: 's2',
      summary: 'Untitled session',
      lastModified: 0
    })
  })
})
