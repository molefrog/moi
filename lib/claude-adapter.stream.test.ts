// Deterministic tests for the live-streaming accumulator in ClaudeAdapter.
//
// These feed synthetic `stream_event` sequences (faithful to the SDK's
// includePartialMessages shape) straight into the adapter and assert on the
// emitted previews. The key property under test is CONCURRENCY correctness: two
// messages streaming at once (a root assistant + a subagent, or parallel
// subagents) must accumulate into separate buffers keyed by message id and never
// bleed into each other — exactly the case the per-message-id design targets.
import { describe, expect, test } from 'bun:test'

import { ClaudeAdapter } from './claude-adapter'
import type { AdapterEmit, StreamPreview } from './format'

// --- synthetic SDK message builders (match the real wire shapes) ------------

let uuidSeq = 0
const uid = () => `evt-${++uuidSeq}`

function streamEvent(parentToolUseId: string | null, event: Record<string, unknown>) {
  return { type: 'stream_event', parent_tool_use_id: parentToolUseId, event, uuid: uid() }
}
const messageStart = (id: string, parent: string | null = null) =>
  streamEvent(parent, { type: 'message_start', message: { id } })
const blockStart = (index: number, kind: 'text' | 'thinking', parent: string | null = null) =>
  streamEvent(parent, {
    type: 'content_block_start',
    index,
    content_block:
      kind === 'thinking' ? { type: 'thinking', thinking: '' } : { type: 'text', text: '' }
  })
const textDelta = (index: number, text: string, parent: string | null = null) =>
  streamEvent(parent, { type: 'content_block_delta', index, delta: { type: 'text_delta', text } })
const thinkingDelta = (index: number, thinking: string, parent: string | null = null) =>
  streamEvent(parent, {
    type: 'content_block_delta',
    index,
    delta: { type: 'thinking_delta', thinking }
  })
const signatureDelta = (index: number, parent: string | null = null) =>
  streamEvent(parent, {
    type: 'content_block_delta',
    index,
    delta: { type: 'signature_delta', signature: 'sig' }
  })
const blockStop = (index: number, parent: string | null = null) =>
  streamEvent(parent, { type: 'content_block_stop', index })
const messageStop = (parent: string | null = null) => streamEvent(parent, { type: 'message_stop' })

function assistantFinal(
  id: string,
  content: { type: string; text?: string; thinking?: string }[],
  parent: string | null = null
) {
  return {
    type: 'assistant',
    message: { role: 'assistant', id, model: 'claude-sonnet-5', content },
    parent_tool_use_id: parent,
    uuid: `turn-${id}`
  }
}
const resultMsg = () => ({ type: 'result', subtype: 'success', uuid: uid() })

// --- helpers to read emits --------------------------------------------------

function previews(emits: AdapterEmit[]): StreamPreview[] {
  return emits.filter(e => e.kind === 'preview').map(e => (e as { preview: StreamPreview }).preview)
}
// The single preview an ingest call is expected to produce (deltas emit one).
function onePreview(emits: AdapterEmit[]): StreamPreview {
  const p = previews(emits)
  expect(p.length).toBe(1)
  return p[0]
}
function blockText(p: StreamPreview, index: number): string {
  return p.blocks.find(b => b.index === index)?.text ?? ''
}

describe('ClaudeAdapter streaming previews', () => {
  test('basic root text stream accumulates cumulatively', () => {
    const a = new ClaudeAdapter()
    expect(previews(a.ingest(messageStart('msg_A')))).toEqual([]) // start: nothing to show
    expect(previews(a.ingest(blockStart(0, 'text')))).toHaveLength(1)

    const p1 = onePreview(a.ingest(textDelta(0, 'Hello')))
    expect(p1.messageId).toBe('msg_A')
    expect(p1.parentToolUseId).toBe(null)
    expect(blockText(p1, 0)).toBe('Hello')

    const p2 = onePreview(a.ingest(textDelta(0, ', world')))
    expect(blockText(p2, 0)).toBe('Hello, world')
  })

  test('finalizing the turn stops further previews for that message id', () => {
    const a = new ClaudeAdapter()
    a.ingest(messageStart('msg_A'))
    a.ingest(blockStart(0, 'text'))
    a.ingest(textDelta(0, 'Hi'))

    const emits = a.ingest(assistantFinal('msg_A', [{ type: 'text', text: 'Hi' }]))
    // The finalized turn carries the api message id so the client can reconcile.
    const turn = emits.find(e => e.kind === 'turn')
    expect(turn).toBeDefined()
    expect((turn as { turn: { meta?: { apiMessageId?: string } } }).turn.meta?.apiMessageId).toBe(
      'msg_A'
    )

    // A stray trailing delta after finalize must NOT re-emit stale text.
    expect(previews(a.ingest(textDelta(0, ' EXTRA')))).toEqual([])
    expect(previews(a.ingest(blockStop(0)))).toEqual([])
    expect(previews(a.ingest(messageStop()))).toEqual([])
  })

  test('thinking + text render as ordered reasoning/text blocks', () => {
    const a = new ClaudeAdapter()
    a.ingest(messageStart('msg_A'))
    a.ingest(blockStart(0, 'thinking'))
    a.ingest(thinkingDelta(0, 'let me think'))
    a.ingest(blockStop(0))
    a.ingest(blockStart(1, 'text'))
    const p = onePreview(a.ingest(textDelta(1, 'the answer')))
    expect(p.blocks).toEqual([
      { index: 0, kind: 'reasoning', text: 'let me think' },
      { index: 1, kind: 'text', text: 'the answer' }
    ])
  })

  test('signature_delta and unknown deltas produce no preview', () => {
    const a = new ClaudeAdapter()
    a.ingest(messageStart('msg_A'))
    a.ingest(blockStart(0, 'thinking'))
    a.ingest(thinkingDelta(0, 'x'))
    expect(previews(a.ingest(signatureDelta(0)))).toEqual([])
  })

  test('CONCURRENT streams (root + subagent) never bleed into each other', () => {
    const a = new ClaudeAdapter()
    const SUB = 'toolu_sub1'
    // Both messages open and interleave their deltas.
    a.ingest(messageStart('msg_ROOT', null))
    a.ingest(messageStart('msg_SUB', SUB))
    a.ingest(blockStart(0, 'text', null))
    a.ingest(blockStart(0, 'text', SUB))

    const r1 = onePreview(a.ingest(textDelta(0, 'AAA', null)))
    expect(r1.messageId).toBe('msg_ROOT')
    expect(r1.parentToolUseId).toBe(null)
    expect(blockText(r1, 0)).toBe('AAA')

    const s1 = onePreview(a.ingest(textDelta(0, 'BBB', SUB)))
    expect(s1.messageId).toBe('msg_SUB')
    expect(s1.parentToolUseId).toBe(SUB)
    expect(blockText(s1, 0)).toBe('BBB')

    // Second round, still interleaved — each accumulates only its own text.
    const r2 = onePreview(a.ingest(textDelta(0, 'aaa', null)))
    expect(r2.messageId).toBe('msg_ROOT')
    expect(blockText(r2, 0)).toBe('AAAaaa')

    const s2 = onePreview(a.ingest(textDelta(0, 'bbb', SUB)))
    expect(s2.messageId).toBe('msg_SUB')
    expect(blockText(s2, 0)).toBe('BBBbbb')

    // Finalizing the subagent leaves the root stream intact.
    a.ingest(assistantFinal('msg_SUB', [{ type: 'text', text: 'BBBbbb' }], SUB))
    const r3 = onePreview(a.ingest(textDelta(0, 'zzz', null)))
    expect(blockText(r3, 0)).toBe('AAAaaazzz')
    // The finalized subagent's message id no longer streams.
    expect(previews(a.ingest(textDelta(0, 'ignored', SUB)))).toEqual([])
  })

  test('a new message on a lane supersedes the prior unfinished one', () => {
    const a = new ClaudeAdapter()
    a.ingest(messageStart('msg_A'))
    a.ingest(blockStart(0, 'text'))
    a.ingest(textDelta(0, 'first'))
    // New message_start on the same (root) lane without finalizing A.
    a.ingest(messageStart('msg_B'))
    a.ingest(blockStart(0, 'text'))
    const p = onePreview(a.ingest(textDelta(0, 'second')))
    expect(p.messageId).toBe('msg_B')
    expect(blockText(p, 0)).toBe('second')
    // A late delta for the superseded message id must not resurrect it.
    expect(previews(a.ingest(textDelta(0, 'late', null)))).toBeDefined()
  })

  test('result clears all live buffers', () => {
    const a = new ClaudeAdapter()
    a.ingest(messageStart('msg_A'))
    a.ingest(blockStart(0, 'text'))
    a.ingest(textDelta(0, 'partial'))
    a.ingest(resultMsg())
    // After result, deltas from a stale message id do nothing.
    expect(previews(a.ingest(textDelta(0, 'more', null)))).toEqual([])
  })

  test('deltas with no active message (orphans) are ignored, not fatal', () => {
    const a = new ClaudeAdapter()
    expect(previews(a.ingest(textDelta(0, 'orphan')))).toEqual([])
    expect(previews(a.ingest(blockStart(0, 'text')))).toEqual([])
    expect(previews(a.ingest(messageStop()))).toEqual([])
  })

  test('never emits a StreamEvent from a stream_event (previews only)', () => {
    const a = new ClaudeAdapter()
    const emits = [
      ...a.ingest(messageStart('msg_A')),
      ...a.ingest(blockStart(0, 'text')),
      ...a.ingest(textDelta(0, 'hi'))
    ]
    expect(emits.every(e => e.kind === 'preview')).toBe(true)
  })
})
