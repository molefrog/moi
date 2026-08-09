// The frame orders a live gateway actually produces, replayed through the real
// session code.
//
// Each scenario below is transcribed from a capture off OpenClaw 2026.7.1
// (`docs/openclaw-sandbox.md` shows how to record one). Only the fields the
// harness reads are kept — a capture also carries a fat session row on every
// frame, timing details, and model prose that no assertion depends on.
//
// The point of these is that unit tests state what we believe the wire does,
// and every ordering/duplication bug this harness has shipped came from a
// belief the wire didn't share. The ORDER of the frames in each array is the
// fact being pinned; it is not editable to taste.
import { describe, expect, test } from 'bun:test'

import type { ToolCall, Turn } from '@/lib/format'

import type { OpenClawMessage } from './discovery'
import { createOpenClawSessionForTest, handleToolFrame, ingest, reconcileForTest } from './session'

const KEY = 'agent:main:dashboard:replay'

type Frame =
  | { kind: 'message'; message: OpenClawMessage }
  // `tool` is the sender's `agent`/tool frame; `observed` is the identical
  // payload as `session.tool`, which is what a connection that did not start
  // the run receives instead (NOTES.md §6).
  | { kind: 'tool' | 'observed'; data: Record<string, unknown> }

function msg(
  role: 'user' | 'assistant',
  id: string,
  seq: number,
  content: OpenClawMessage['content']
): Frame {
  return {
    kind: 'message',
    message: { role, content, timestamp: 1786296100000 + seq, __openclaw: { id, seq } }
  } as Frame
}

function toolResultRow(id: string, seq: number, toolCallId: string, text: string): OpenClawMessage {
  return {
    role: 'toolResult',
    toolCallId,
    content: [{ type: 'text', text }],
    timestamp: 1786296100000 + seq,
    __openclaw: { id, seq }
  } as unknown as OpenClawMessage
}

const start = (toolCallId: string, command: string): Frame => ({
  kind: 'tool',
  data: { phase: 'start', name: 'exec', toolCallId, args: { command } }
})

const result = (toolCallId: string, text: string): Frame => ({
  kind: 'tool',
  data: {
    phase: 'result',
    name: 'exec',
    toolCallId,
    isError: false,
    result: { content: [{ type: 'text', text }], details: { status: 'completed', exitCode: 0 } }
  }
})

const observed = (frame: Frame): Frame =>
  frame.kind === 'tool' ? { kind: 'observed', data: frame.data } : frame

function play(frames: Frame[], workspaceId = 'ws-replay') {
  const rec = createOpenClawSessionForTest({ workspaceId, sessionId: 'replay', sessionKey: KEY })
  for (const frame of frames) {
    if (frame.kind === 'message') ingest(rec, frame.message)
    // Both frame families go through the one handler; `session.tool` and
    // `agent`/tool differ only in which connection the gateway sends them to.
    else handleToolFrame(rec, { sessionKey: KEY, data: frame.data })
  }
  return rec
}

function shape(turns: Turn[]): string[] {
  return turns.map(t => {
    const parts = t.parts
      .map(p =>
        p.type === 'tool-call' ? `tool:${p.call.name}:${p.call.state}` : (p.type as string)
      )
      .join('+')
    return `${t.role}:${parts}`
  })
}

function toolCards(turns: Turn[]): ToolCall[] {
  return turns.flatMap(t => t.parts.flatMap(p => (p.type === 'tool-call' ? [p.call] : [])))
}

const output = (call: ToolCall) => String(call.output ?? '').trim()

// ── One tool call ────────────────────────────────────────────────────────────
// Identical on `ollama-cloud/glm-5.2:cloud` and `openai/gpt-5.5`. The durable
// row that owns the call commits ~4ms BEFORE the tool start frame — that race,
// in that direction, is what made the old code re-id an already-broadcast turn
// and render every single-tool run twice. Note also what never arrives live:
// the `toolResult` row (seq 3) is in the transcript and not on the wire.
const CALL_ID = 'call_y42lj8xv'
const SINGLE_TOOL: Frame[] = [
  msg('user', '9e1e6099', 1, 'Run the shell command: echo hello-from-ollama.'),
  msg('assistant', '3ba0cc35', 2, [
    {
      type: 'toolCall',
      id: CALL_ID,
      name: 'exec',
      arguments: { command: 'echo hello-from-ollama' }
    }
  ]),
  start(CALL_ID, 'echo hello-from-ollama'),
  result(CALL_ID, 'hello-from-ollama'),
  msg('assistant', 'dbd9c0bc', 4, [
    { type: 'text', text: 'The command printed: `hello-from-ollama`.' }
  ])
]

// The GPT run adds a durable `thinking` block on the owner row — the same
// re-id bug duplicated that too.
const GPT_CALL_ID = 'call_VED4G03AgeTwaLYlVE3hMit1|fc_01da275f01aaf4c6006a78b75bee9881'
const SINGLE_TOOL_WITH_REASONING: Frame[] = [
  msg('user', 'c01cc62a', 1, 'Run the shell command: echo hello-from-gpt.'),
  msg('assistant', '80068381', 2, [
    { type: 'thinking', thinking: 'The user wants a shell command run. Straightforward.' },
    {
      type: 'toolCall',
      id: GPT_CALL_ID,
      name: 'exec',
      arguments: { command: 'echo hello-from-gpt' }
    }
  ]),
  start(GPT_CALL_ID, 'echo hello-from-gpt'),
  result(GPT_CALL_ID, 'hello-from-gpt'),
  msg('assistant', 'bb21cc02', 4, [{ type: 'text', text: 'It printed: `hello-from-gpt`.' }])
]

// ── Calls fanned out of one row ──────────────────────────────────────────────
// The owner row streams as TEXT ONLY and grows its three `toolCall` blocks
// afterwards with no second frame, so the calls reach us only as tool frames.
// The transcript at the end disagrees with what was streamed — which is why the
// reconcile has to refresh rows whose content changed, and why the refreshed row
// must not re-render calls that already have cards.
const FAN_IDS = ['call_d88i21w1', 'call_0f2nwkab', 'call_p7i1myi5']
const FAN_WORDS = ['one', 'two', 'three']
const PARALLEL_TOOLS: Frame[] = [
  msg('user', '327e80c4', 1, "Run 'echo one', 'echo two' and 'echo three'."),
  msg('assistant', 'a927f29c', 2, [
    { type: 'text', text: "I'll run all three commands since they're independent of each other." }
  ]),
  ...FAN_IDS.map((id, i) => start(id, `echo ${FAN_WORDS[i]}`)),
  ...FAN_IDS.map((id, i) => result(id, FAN_WORDS[i])),
  msg('assistant', 'a7097f68', 6, [{ type: 'text', text: "Here's the summary: one, two, three." }])
]

// What `sessions.get` returns for that run once it ends — note the owner row
// now carries the blocks it never streamed.
const PARALLEL_TRANSCRIPT: OpenClawMessage[] = [
  {
    role: 'user',
    content: "Run 'echo one', 'echo two' and 'echo three'.",
    __openclaw: { id: '327e80c4', seq: 1 }
  },
  {
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: "I'll run all three commands since they're independent of each other."
      },
      ...FAN_IDS.map((id, i) => ({
        type: 'toolCall',
        id,
        name: 'exec',
        arguments: { command: `echo ${FAN_WORDS[i]}` }
      }))
    ],
    __openclaw: { id: 'a927f29c', seq: 2 }
  },
  ...FAN_IDS.map((id, i) => toolResultRow(`res-${i}`, 3 + i, id, FAN_WORDS[i])),
  {
    role: 'assistant',
    content: [{ type: 'text', text: "Here's the summary: one, two, three." }],
    __openclaw: { id: 'a7097f68', seq: 6 }
  }
] as unknown as OpenClawMessage[]

describe('one tool call, owner row first (both providers)', () => {
  const cases: [name: string, frames: Frame[], out: string][] = [
    ['ollama', SINGLE_TOOL, 'hello-from-ollama'],
    ['openai', SINGLE_TOOL_WITH_REASONING, 'hello-from-gpt'],
    // The same run seen by a connection that only subscribed: tool activity
    // arrives as `session.tool`. It must render identically.
    ['observed from another connection', SINGLE_TOOL.map(observed), 'hello-from-ollama']
  ]

  for (const [name, frames, out] of cases) {
    test(`${name}: renders exactly one card, on the durable row`, () => {
      const rec = play(frames)
      const cards = toolCards(rec.view.turns)
      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({ name: 'exec', state: 'success' })
      expect(output(cards[0])).toBe(out)
      expect(rec.view.turns.filter(t => t.id.includes(':livetool:'))).toHaveLength(0)
    })

    test(`${name}: the answer comes after the tool that produced it`, () => {
      const shapes = shape(play(frames).view.turns)
      expect(shapes.findIndex(s => s.includes('tool:exec'))).toBeLessThan(
        shapes.lastIndexOf('assistant:text')
      )
    })
  }

  test('openai: the reasoning block renders once, not once per emit', () => {
    const shapes = shape(play(SINGLE_TOOL_WITH_REASONING).view.turns)
    expect(shapes.filter(s => s.includes('reasoning'))).toHaveLength(1)
  })
})

describe('calls fanned out of one row', () => {
  test('each renders as its own card, in call order', () => {
    const cards = toolCards(play(PARALLEL_TOOLS).view.turns)
    expect(cards).toHaveLength(3)
    expect(cards.map(c => c.toolCallId)).toEqual(FAN_IDS)
    expect(cards.map(output)).toEqual(FAN_WORDS)
  })

  test('the cards sit between the plan and the summary', () => {
    const shapes = shape(play(PARALLEL_TOOLS).view.turns)
    const first = shapes.findIndex(s => s.includes('tool:exec'))
    const last = shapes.map(s => s.includes('tool:exec')).lastIndexOf(true)
    expect(shapes.slice(0, first)).toContain('assistant:text')
    expect(shapes.slice(last + 1)).toContain('assistant:text')
  })

  test('the run-end reconcile adds no duplicates when the owner row catches up', () => {
    const rec = play(PARALLEL_TOOLS)
    const before = shape(rec.view.turns)
    reconcileForTest(rec, PARALLEL_TRANSCRIPT)
    expect(shape(rec.view.turns)).toEqual(before)
    expect(toolCards(rec.view.turns)).toHaveLength(3)
  })
})

describe('transcript order survives out-of-order delivery', () => {
  test('a row that arrives late is placed by its seq, not by arrival', () => {
    const messages = SINGLE_TOOL.filter(f => f.kind === 'message').map(f =>
      f.kind === 'message' ? f.message : null
    )
    const rec = createOpenClawSessionForTest({
      workspaceId: 'ws-order',
      sessionId: 'order',
      sessionKey: KEY
    })
    // Deliver the final answer first — what a dropped frame plus a reconcile
    // looks like from here.
    ingest(rec, messages[messages.length - 1]!)
    for (const m of messages.slice(0, -1)) ingest(rec, m!)

    const seqs = rec.view.turns.map(t => t.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => (a ?? 0) - (b ?? 0)))
    expect(rec.view.turns[0].role).toBe('user')
  })
})
