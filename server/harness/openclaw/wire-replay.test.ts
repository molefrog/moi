// Replay of real gateway traffic.
//
// The fixtures in `fixtures/` are verbatim frame logs captured from a live
// OpenClaw 2026.7.1 gateway (see NOTES.md §6 for how). Each one is one chat
// turn: the frames the gateway pushed, in the order it pushed them, plus the
// durable transcript `sessions.get` returned at the end.
//
// Unit tests state what we believe the wire does; these state what it did.
// Every ordering/duplication bug this harness has shipped came from a belief
// about frame order that the wire didn't share, so the guard has to be the
// recording, not the belief.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { OpenClawMessage } from './discovery'
import { createOpenClawSessionForTest, handleToolFrame, ingest, reconcileForTest } from './session'
import type { ToolCall, Turn } from '@/lib/format'

type Frame = {
  kind: 'meta' | 'event' | 'durable'
  data: {
    label?: string
    sessionKey?: string
    event?: string
    payload?: Record<string, unknown>
    messages?: OpenClawMessage[]
  }
}

function load(name: string): { sessionKey: string; frames: Frame[] } {
  const frames = readFileSync(join(import.meta.dir, 'fixtures', `${name}.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map(l => JSON.parse(l) as Frame)
  const meta = frames.find(f => f.kind === 'meta')
  return { sessionKey: meta?.data.sessionKey ?? '', frames }
}

// Drive a record through a capture exactly the way the live subscription does
// (`ensureSubscribed`), then run the run-end reconcile against the captured
// transcript. Returns the view the client would hold.
function replay(name: string) {
  const { sessionKey, frames } = load(name)
  const rec = createOpenClawSessionForTest({
    workspaceId: 'ws-replay',
    sessionId: 'replay',
    sessionKey
  })
  for (const frame of frames) {
    if (frame.kind !== 'event') continue
    const { event, payload = {} } = frame.data
    if (payload.sessionKey !== sessionKey) continue
    if (event === 'session.message') ingest(rec, payload.message as OpenClawMessage)
    else if (event === 'session.tool') handleToolFrame(rec, payload)
    else if (event === 'agent' && payload.stream === 'tool') handleToolFrame(rec, payload)
  }
  const durable = frames.find(f => f.kind === 'durable')
  return { rec, durable: durable?.data.messages ?? [] }
}

// One line per rendered turn: role, then each part reduced to a shape we can
// assert on without pinning model prose.
function shape(turns: Turn[]): string[] {
  return turns.map(t => {
    const parts = t.parts
      .map(p => {
        if (p.type === 'text') return 'text'
        if (p.type === 'reasoning') return 'reasoning'
        if (p.type === 'tool-call') return `tool:${p.call.name}:${p.call.state}`
        return p.type
      })
      .join('+')
    return `${t.role}:${parts}`
  })
}

function toolCards(turns: Turn[]): ToolCall[] {
  return turns.flatMap(t => t.parts.flatMap(p => (p.type === 'tool-call' ? [p.call] : [])))
}

describe('replaying real gateway captures', () => {
  // The single-tool shape, identical on both providers: the durable assistant
  // row carrying the `toolCall` block commits ~4ms BEFORE the tool start frame.
  // The card therefore belongs to that row, and the tool frames only fill in
  // its state — synthesizing a second card here is what produced the
  // permanently-pending duplicate this test now pins down.
  for (const name of ['ollama-single-tool', 'openai-single-tool']) {
    test(`${name}: one tool call renders exactly one card`, () => {
      const { rec } = replay(name)
      const cards = toolCards(rec.view.turns)
      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({ name: 'exec', state: 'success' })
      expect(String(cards[0].output ?? '').trim()).toBeTruthy()
      // No `livetool:` turn: the durable row owned the call from the start.
      expect(rec.view.turns.filter(t => t.id.includes(':livetool:'))).toHaveLength(0)
    })

    test(`${name}: the answer comes after the tool that produced it`, () => {
      const { rec } = replay(name)
      const shapes = shape(rec.view.turns)
      const toolAt = shapes.findIndex(s => s.includes('tool:exec'))
      const answerAt = shapes.lastIndexOf('assistant:text')
      expect(toolAt).toBeGreaterThan(-1)
      expect(answerAt).toBeGreaterThan(toolAt)
    })
  }

  // Same gateway, same run shape, but captured from a connection that only
  // subscribed — so the tool activity arrives as `session.tool` rather than
  // `agent`/tool. This is what moi sees for a run it did not start. The two
  // must render identically; that they do is the point of routing both frame
  // families into one handler.
  test('ollama-observed-tool: a watched run renders like one we started', () => {
    const { rec } = replay('ollama-observed-tool')
    const cards = toolCards(rec.view.turns)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ name: 'exec', state: 'success' })
    expect(String(cards[0].output ?? '').trim()).toBe('hello-from-observer')
    expect(rec.view.turns.filter(t => t.id.includes(':livetool:'))).toHaveLength(0)
  })

  test('openai-single-tool: reasoning renders once, not once per emit', () => {
    const { rec } = replay('openai-single-tool')
    expect(shape(rec.view.turns).filter(s => s.includes('reasoning'))).toHaveLength(1)
  })

  // The fan-out shape: the assistant row streams as text and grows its three
  // `toolCall` blocks silently afterwards, so those calls reach us ONLY as tool
  // frames. Each needs its own card, and the durable row must not re-render
  // them when the reconcile finally sees the grown row.
  test('ollama-parallel-tools: three fanned-out calls render three cards', () => {
    const { rec } = replay('ollama-parallel-tools')
    const cards = toolCards(rec.view.turns)
    expect(cards).toHaveLength(3)
    expect(cards.every(c => c.state === 'success')).toBe(true)
    expect(cards.map(c => String(c.output ?? '').trim())).toEqual(['one', 'two', 'three'])
  })

  test('ollama-parallel-tools: the run-end reconcile adds no duplicates', () => {
    const { rec, durable } = replay('ollama-parallel-tools')
    const before = shape(rec.view.turns)
    reconcileForTest(rec, durable)
    expect(shape(rec.view.turns)).toEqual(before)
    expect(toolCards(rec.view.turns)).toHaveLength(3)
  })

  test('ollama-parallel-tools: tools sit between the plan and the summary', () => {
    const { rec } = replay('ollama-parallel-tools')
    const shapes = shape(rec.view.turns)
    const firstTool = shapes.findIndex(s => s.includes('tool:exec'))
    const lastTool = shapes.map(s => s.includes('tool:exec')).lastIndexOf(true)
    // The row that announced the plan precedes every card…
    expect(shapes.slice(0, firstTool)).toContain('assistant:text')
    // …and the summary follows every card.
    expect(shapes.slice(lastTool + 1)).toContain('assistant:text')
  })

  // A durable row that reaches us late (dropped frame, reconnect) must land
  // where the transcript says it belongs, not at the end of the chat.
  test('a row that arrives out of order is placed by its transcript seq', () => {
    const { sessionKey, frames } = load('ollama-single-tool')
    const rec = createOpenClawSessionForTest({
      workspaceId: 'ws-order',
      sessionId: 'order',
      sessionKey
    })
    const messages = frames
      .filter(f => f.kind === 'event' && f.data.event === 'session.message')
      .map(f => f.data.payload?.message as OpenClawMessage)
    expect(messages.length).toBeGreaterThan(1)
    // Deliver the last row first, then the rest in order.
    ingest(rec, messages[messages.length - 1])
    for (const m of messages.slice(0, -1)) ingest(rec, m)
    const seqs = rec.view.turns.map(t => t.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(rec.view.turns[0].role).toBe('user')
  })
})
