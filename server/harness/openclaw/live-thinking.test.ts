// The codex-app-server reasoning indicator.
//
// That backend reports reasoning as an `agent`/item frame — `kind:'analysis'`,
// `title:'Reasoning'`, phases start→end — and never sends the text: the frames
// below are verbatim from a live 2026.7.1-2 capture, and the run's durable
// assistant row that followed them carried a `text` block only. So the run has
// a visible ~1.1s gap between the send and the first token with nothing on
// screen. We render the one thing the backend does report: how long it thought.
import { describe, expect, test } from 'bun:test'

import type { Part } from '@/lib/format'

import { createOpenClawSessionForTest, handleReasoningItemFrame } from './session'

const SESSION_KEY = 'agent:live-think:main'
const ITEM_ID = 'rs_0c6646726346115f016a785c9c65b48191820511665f7db7d8'

function newRec() {
  const rec = createOpenClawSessionForTest({
    workspaceId: 'ws-live-think',
    sessionId: `s-${Math.random().toString(36).slice(2)}`,
    sessionKey: SESSION_KEY
  })
  rec.codexBackend = true
  return rec
}

function reasoningParts(rec: ReturnType<typeof newRec>): Part[] {
  return rec.view.turns.flatMap(t => t.parts.filter(p => p.type === 'reasoning'))
}

// Real frame shapes, timestamps included — the pair is 1111ms apart on the wire.
const START = {
  runId: '134a6491-a590-4c75-a6e4-ad24257e7490',
  stream: 'item',
  sessionKey: SESSION_KEY,
  ts: 1786272924275,
  data: {
    itemId: ITEM_ID,
    phase: 'start',
    kind: 'analysis',
    title: 'Reasoning',
    status: 'running'
  }
}
const END = {
  ...START,
  ts: 1786272925386,
  data: { ...START.data, phase: 'end', status: 'completed' }
}

describe('codex reasoning item → thinking row', () => {
  test('a start frame renders a redacted, textless reasoning part', () => {
    const rec = newRec()
    handleReasoningItemFrame(rec, START)
    const parts = reasoningParts(rec)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual({ type: 'reasoning', text: '', redacted: true })
  })

  test('the end frame upserts the same turn with the elapsed duration', () => {
    const rec = newRec()
    handleReasoningItemFrame(rec, START)
    handleReasoningItemFrame(rec, END)
    const parts = reasoningParts(rec)
    // Upsert by id — one row, not two.
    expect(parts).toHaveLength(1)
    expect(parts[0]).toEqual({
      type: 'reasoning',
      text: '',
      redacted: true,
      durationMs: 1111
    })
  })

  test('two reasoning items in one run render as two rows', () => {
    const rec = newRec()
    handleReasoningItemFrame(rec, START)
    handleReasoningItemFrame(rec, END)
    const second = { ...START, ts: 1786272930000, data: { ...START.data, itemId: 'rs_second' } }
    handleReasoningItemFrame(rec, second)
    expect(reasoningParts(rec)).toHaveLength(2)
  })

  test('an end with no start is ignored rather than rendering a zero-length row', () => {
    const rec = newRec()
    handleReasoningItemFrame(rec, END)
    expect(reasoningParts(rec)).toHaveLength(0)
  })

  test('tool item frames are not mistaken for reasoning', () => {
    const rec = newRec()
    // The same `item` stream also carries tool lifecycle; only analysis counts.
    handleReasoningItemFrame(rec, {
      ...START,
      data: {
        itemId: 'call_1',
        phase: 'start',
        kind: 'command_execution',
        title: 'exec',
        status: 'running'
      }
    })
    expect(reasoningParts(rec)).toHaveLength(0)
  })

  test('a frame with no itemId is ignored', () => {
    const rec = newRec()
    handleReasoningItemFrame(rec, { ...START, data: { phase: 'start', kind: 'analysis' } })
    expect(reasoningParts(rec)).toHaveLength(0)
  })
})
