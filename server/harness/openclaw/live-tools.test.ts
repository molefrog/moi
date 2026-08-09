// Who owns a tool card.
//
// Tool activity reaches us as `session.tool` or as `agent`/tool — the same
// payload, split by audience rather than by backend (see handleToolFrame). The
// only question that matters for rendering is whether a durable row owns the
// call yet:
//
//   - it does (the common single-call shape on every provider verified: the
//     row commits ~4ms BEFORE the start frame) → the row renders the card and
//     the frames only fill in its state;
//   - it doesn't (calls fanned out from one row, which streams as text and
//     grows its `toolCall` blocks silently) → the frame is the only evidence
//     the call exists, so it gets its own card.
//
// Ownership is decided once, when the card is created, and never revisited: a
// broadcast turn can be upserted but never retracted, so a card that changes
// identity mid-run is a duplicate on screen forever. `wire-replay.test.ts`
// holds the recorded frame orders these rules come from.
import { describe, expect, test } from 'bun:test'

import type { OpenClawMessage } from './discovery'
import {
  createOpenClawSessionForTest,
  handleToolFrame,
  ingest,
  reconcileForTest,
  reconcileSnapshotForTest,
  reconcileWithStaleForTest
} from './session'

const SESSION_KEY = 'agent:live-tools:main'
const TOOL_ID = 'exec-c5dfffcc'

function newRec() {
  return createOpenClawSessionForTest({
    workspaceId: 'ws-live-tools',
    sessionId: `s-${Math.random().toString(36).slice(2)}`,
    sessionKey: SESSION_KEY
  })
}

// The durable assistant row that owns TOOL_ID.
function durableToolRow(command: string, extra: OpenClawMessage['content'] = []): OpenClawMessage {
  return {
    role: 'assistant',
    content: [
      ...(extra as object[]),
      { type: 'toolCall', id: TOOL_ID, name: 'exec', arguments: { command } }
    ],
    timestamp: 1785861026066,
    __openclaw: { id: 'd303c332', seq: 10 }
  } as unknown as OpenClawMessage
}

function startFrame(id = TOOL_ID, command = 'echo red') {
  return { data: { phase: 'start', toolCallId: id, name: 'exec', args: { command } } }
}

function resultFrame(id = TOOL_ID, text = 'red') {
  return {
    data: { phase: 'result', toolCallId: id, result: { content: [{ type: 'text', text }] } }
  }
}

function cards(rec: ReturnType<typeof newRec>) {
  return rec.view.turns.flatMap(t =>
    t.parts.flatMap(p => (p.type === 'tool-call' ? [{ turnId: t.id, call: p.call }] : []))
  )
}

describe('a durable row already owns the call', () => {
  test('the row renders the only card and the frames fill it in', () => {
    const rec = newRec()
    ingest(rec, durableToolRow('echo red'))
    handleToolFrame(rec, startFrame())
    handleToolFrame(rec, resultFrame())

    const found = cards(rec)
    expect(found).toHaveLength(1)
    expect(found[0].turnId).toBe(`openclaw:${SESSION_KEY}:d303c332`)
    expect(found[0].call).toMatchObject({ name: 'exec', state: 'success', output: 'red' })
  })

  test('re-emitting the row (reconcile) keeps it at one card', () => {
    const rec = newRec()
    ingest(rec, durableToolRow('echo red'))
    handleToolFrame(rec, startFrame())
    handleToolFrame(rec, resultFrame())
    reconcileForTest(rec, [durableToolRow('echo red')])

    expect(cards(rec)).toHaveLength(1)
  })
})

describe('no durable row owns the call yet', () => {
  test('the start frame renders a card of its own', () => {
    const rec = newRec()
    handleToolFrame(rec, startFrame())

    const found = cards(rec)
    expect(found).toHaveLength(1)
    expect(found[0].turnId).toBe(`openclaw:${SESSION_KEY}:livetool:${TOOL_ID}`)
    expect(found[0].call).toMatchObject({
      name: 'exec',
      state: 'running',
      input: { command: 'echo red' }
    })
  })

  test('the result frame flips that card to success with its output', () => {
    const rec = newRec()
    handleToolFrame(rec, startFrame())
    handleToolFrame(rec, resultFrame())

    const found = cards(rec)
    expect(found).toHaveLength(1)
    expect(found[0].call).toMatchObject({ state: 'success', output: 'red' })
  })

  test('a row that later grows the same toolCall block does not render it again', () => {
    const rec = newRec()
    handleToolFrame(rec, startFrame())
    handleToolFrame(rec, resultFrame())
    // The row streamed as text first; the reconcile sees it with the block.
    ingest(rec, {
      role: 'assistant',
      content: [{ type: 'text', text: "I'll run that." }],
      timestamp: 1785861026000,
      __openclaw: { id: 'd303c332', seq: 10 }
    } as unknown as OpenClawMessage)
    reconcileForTest(rec, [durableToolRow('echo red', [{ type: 'text', text: "I'll run that." }])])

    const found = cards(rec)
    expect(found).toHaveLength(1)
    expect(found[0].turnId).toBe(`openclaw:${SESSION_KEY}:livetool:${TOOL_ID}`)
    // The row still renders its text, just not a second copy of the call.
    expect(rec.view.turns.some(t => t.parts.some(p => p.type === 'text'))).toBe(true)
  })

  test('calls fanned out from one row each land as exactly one card, in order', () => {
    const rec = newRec()
    const ids = ['exec-aaa', 'exec-bbb', 'exec-ccc']
    for (const id of ids) handleToolFrame(rec, startFrame(id, `echo ${id}`))
    for (const id of ids) handleToolFrame(rec, resultFrame(id, id))

    const found = cards(rec)
    expect(found).toHaveLength(3)
    expect(found.map(c => c.call.toolCallId)).toEqual(ids)
    expect(found.every(c => c.call.state === 'success')).toBe(true)
  })

  test('a card still running when the run ends fails rather than spinning', () => {
    const rec = newRec()
    handleToolFrame(rec, startFrame())
    expect(cards(rec)[0].call.state).toBe('running')

    // The result frame never arrives — a dropped frame, or a runtime that
    // persists no tool rows at all. All we know is that nothing came back, so
    // the card must not claim the command succeeded.
    reconcileForTest(rec, [])
    expect(cards(rec)[0].call.state).toBe('error')
    expect(cards(rec)[0].call.errorText).toContain('No result')
  })

  test('a reconcile does not finalize cards belonging to a later run', () => {
    const rec = newRec()
    handleToolFrame(rec, startFrame('exec-first'))
    // The first run ends; its reconcile snapshots the unfinished cards…
    const stale = reconcileSnapshotForTest(rec)
    // …and while the transcript is in flight, a follow-up run starts a tool.
    handleToolFrame(rec, startFrame('exec-second'))
    reconcileWithStaleForTest(rec, [], stale)

    const byId = new Map(cards(rec).map(c => [c.call.toolCallId, c.call]))
    expect(byId.get('exec-first')?.state).toBe('error')
    // The new run's card is untouched — its result is still coming.
    expect(byId.get('exec-second')?.state).toBe('running')
  })
})
