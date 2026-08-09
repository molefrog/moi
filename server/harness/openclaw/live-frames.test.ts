// Wire-fixture tests for the live protocol-v4 layer: chat delta previews,
// session.tool result flattening, and durable-row → Turn mapping. Fixtures are
// real frames captured from live gateways (2026.7.1 events-v2/events-tool runs,
// 2026.6.33 events-v633 run); bulky session-row fields are trimmed but message
// field placement is faithful to the wire.
import { describe, expect, test } from 'bun:test'

import type { OpenClawMessage } from './discovery'
import {
  type ToolResultInfo,
  flattenToolResultContent,
  messageToTurn,
  toStreamEvents
} from './adapter'
import { chatPreviewBlocks, claimPreviewSource, normalizeEchoText } from './session'

describe('chatPreviewBlocks', () => {
  test('maps a real first chat delta onto one text block', () => {
    // `chat` frame, state delta, from a live 2026.7.1 run: payload.message
    // carries the cumulative in-progress assistant message.
    const first = {
      role: 'assistant',
      content: [{ type: 'text', text: 'The' }],
      timestamp: 1785860956730
    }
    expect(chatPreviewBlocks(first.content)).toEqual([{ index: 0, kind: 'text', text: 'The' }])
  })

  test('later deltas are cumulative snapshots, not increments', () => {
    // Same run, a later delta (deltaText was just " moon is…"): the message
    // content already holds the full text so far.
    const later = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: "The moon is Earth's only natural satellite, quietly pulling our tides for about 4.5 billion years."
        }
      ],
      timestamp: 1785860956833
    }
    expect(chatPreviewBlocks(later.content)).toEqual([
      {
        index: 0,
        kind: 'text',
        text: "The moon is Earth's only natural satellite, quietly pulling our tides for about 4.5 billion years."
      }
    ])
  })

  test('thinking becomes reasoning with the block index preserved', () => {
    const blocks = chatPreviewBlocks([
      { type: 'thinking', thinking: 'Count the workspace entries first.' },
      { type: 'text', text: '8' }
    ])
    expect(blocks).toEqual([
      { index: 0, kind: 'reasoning', text: 'Count the workspace entries first.' },
      { index: 1, kind: 'text', text: '8' }
    ])
  })

  test('empty thinking and toolCall blocks are dropped (real 2026.6.33 content)', () => {
    // Assistant row content exactly as the 2026.6.33 gateway stores a
    // tool-only response: an empty thinking block plus the toolCall.
    const content = [
      { type: 'thinking', thinking: '' },
      {
        type: 'toolCall',
        id: 'toolu_01ULbCCwudMktckjS7M2b5n1',
        name: 'exec',
        arguments: { command: 'echo ping' }
      }
    ]
    expect(chatPreviewBlocks(content)).toEqual([])
  })

  test('plain-string content previews as one block; empty and non-array yield none', () => {
    expect(chatPreviewBlocks('The')).toEqual([{ index: 0, kind: 'text', text: 'The' }])
    expect(chatPreviewBlocks('')).toEqual([])
    expect(chatPreviewBlocks(undefined)).toEqual([])
    expect(chatPreviewBlocks({ nope: true })).toEqual([])
  })
})

// Durable assistant toolCall row from a live 2026.7.1 run (events-tool
// capture), trimmed: cost keeps only `total`.
const assistantToolRow = {
  role: 'assistant',
  content: [
    {
      type: 'toolCall',
      id: 'toolu_01Wsq3A7DBny48syWknThx7B',
      name: 'exec',
      arguments: { command: 'ls ~/.openclaw/workspace | wc -l' }
    }
  ],
  api: 'anthropic-messages',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  usage: {
    input: 2,
    output: 64,
    totalTokens: 42031,
    cacheRead: 41870,
    cacheWrite: 95,
    cost: { total: 0.0092555 }
  },
  stopReason: 'toolUse',
  timestamp: 1785861026066,
  responseId: 'msg_011Cdi2VhkvxwgjLTzYgJkvU',
  responseModel: 'claude-sonnet-5',
  __openclaw: { id: 'd303c332', seq: 10 }
  // Widened: model/usage/stopReason live outside the OpenClawMessage subset, as on the wire.
} as OpenClawMessage

function toolCallPart(results: Map<string, ToolResultInfo>) {
  const turn = messageToTurn(assistantToolRow, 'agent:main:main', 0, results)
  const part = turn?.parts[0]
  if (part?.type !== 'tool-call') throw new Error('expected a tool-call part')
  return part.call
}

describe('messageToTurn tool-call states', () => {
  const id = 'toolu_01Wsq3A7DBny48syWknThx7B'

  test('no results entry → pending with no output', () => {
    const call = toolCallPart(new Map())
    expect(call).toMatchObject({
      toolCallId: id,
      name: 'exec',
      provider: 'openclaw',
      state: 'pending'
    })
    expect(call.output).toBeUndefined()
    expect(call.errorText).toBeUndefined()
  })

  test('running entry (live session.tool start) → running, output withheld', () => {
    // Exactly what handleToolFrame stores for a start/update frame.
    const call = toolCallPart(
      new Map([[id, { output: '', isError: false, running: true, toolName: 'exec' }]])
    )
    expect(call.state).toBe('running')
    expect(call.output).toBeUndefined()
  })

  test('success entry (real session.tool result) → success with output folded in', () => {
    const call = toolCallPart(new Map([[id, { output: '8', isError: false, toolName: 'exec' }]]))
    expect(call.state).toBe('success')
    expect(call.output).toBe('8')
    expect(call.errorText).toBeUndefined()
  })

  test('error entry → error with errorText, not output', () => {
    const call = toolCallPart(new Map([[id, { output: 'exec failed: exit 1', isError: true }]]))
    expect(call.state).toBe('error')
    expect(call.errorText).toBe('exec failed: exit 1')
    expect(call.output).toBeUndefined()
  })
})

describe('flattenToolResultContent', () => {
  test('flattens the real session.tool result content to its output string', () => {
    // `data.result.content` from the live 2026.7.1 result frame for the exec
    // call above (details sibling trimmed).
    expect(flattenToolResultContent([{ type: 'text', text: '8' }])).toBe('8')
  })

  test('non-text blocks become a [type] placeholder line', () => {
    expect(
      flattenToolResultContent([
        { type: 'text', text: 'ok' },
        { type: 'image', source: { type: 'base64' } }
      ])
    ).toBe('ok\n[image]')
  })

  test('string content passes through untouched', () => {
    expect(flattenToolResultContent('')).toBe('')
  })
})

describe('messageToTurn meta (extractTurnMeta)', () => {
  test('real durable assistant row → usage, model, provider, stopReason', () => {
    // Final assistant row of the live 2026.7.1 tool run (events-tool capture),
    // usage placement faithful: {input, output, totalTokens, cost.total}.
    const row = {
      role: 'assistant',
      content: [{ type: 'text', text: '8' }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: {
        input: 2,
        output: 3,
        totalTokens: 42040,
        cacheRead: 41965,
        cacheWrite: 70,
        cost: { total: 0.008602 }
      },
      stopReason: 'stop',
      timestamp: 1785861029189,
      responseId: 'msg_011Cdi2VwmneyCgkdXxY8Gid',
      responseModel: 'claude-sonnet-5',
      __openclaw: { id: 'bd61e44f', seq: 12 }
      // Widened: model/usage/stopReason live outside the OpenClawMessage subset, as on the wire.
    } as OpenClawMessage
    const turn = messageToTurn(row, 'agent:main:main', 3, new Map())
    expect(turn?.meta).toEqual({
      model: 'claude-sonnet-5',
      provider: 'anthropic',
      stopReason: 'stop',
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 42040, costUsd: 0.008602 }
    })
    expect(turn).toMatchObject({
      id: 'openclaw:agent:main:main:bd61e44f',
      role: 'assistant',
      seq: 12,
      timestamp: new Date(1785861029189).toISOString()
    })
  })

  test('real user row: plain-string content, no meta', () => {
    // Durable user row of the same run (2026.7.1 nests the idempotency key
    // under __openclaw).
    const row: OpenClawMessage = {
      role: 'user',
      content:
        'Use your exec tool to run: ls ~/.openclaw/workspace — then reply with just the number of entries.',
      timestamp: 1785861025674,
      __openclaw: { id: '7aadc298', seq: 9 }
    }
    const turn = messageToTurn(row, 'agent:main:main', 0, new Map())
    expect(turn).toMatchObject({
      id: 'openclaw:agent:main:main:7aadc298',
      role: 'user',
      origin: { kind: 'user-input' },
      parts: [
        {
          type: 'text',
          text: 'Use your exec tool to run: ls ~/.openclaw/workspace — then reply with just the number of entries.'
        }
      ]
    })
    expect(turn?.meta).toBeUndefined()
  })
})

describe('normalizeEchoText — optimistic-echo rendezvous (issue: duplicated user bubble)', () => {
  test('collapses whitespace so newline/trim drift still matches', () => {
    expect(normalizeEchoText('Sup fool')).toBe(normalizeEchoText('  Sup  fool\n'))
  })

  test('strips a moi-context envelope defensively', () => {
    const withEnvelope =
      'Sup fool\n\n<moi-context>\nYou are running in a `moi` workspace\n</moi-context>'
    expect(normalizeEchoText(withEnvelope)).toBe('Sup fool')
  })

  test('empty and non-string inputs are safe', () => {
    expect(normalizeEchoText(undefined)).toBe('')
    expect(normalizeEchoText('')).toBe('')
  })
})

describe('reasoning field drift (issue: no thinking blocks on newer gateways)', () => {
  test('chatPreviewBlocks maps every thinking/reasoning field variant', () => {
    // 2026.7.1 ships `{ type: 'thinking', thinking }`; newer lines emit
    // `reasoning` and/or carry the text in `text`.
    expect(chatPreviewBlocks([{ type: 'thinking', thinking: 'hm' }])).toEqual([
      { index: 0, kind: 'reasoning', text: 'hm' }
    ])
    expect(chatPreviewBlocks([{ type: 'reasoning', reasoning: 'why' }])).toEqual([
      { index: 0, kind: 'reasoning', text: 'why' }
    ])
    expect(chatPreviewBlocks([{ type: 'reasoning', text: 'because' }])).toEqual([
      { index: 0, kind: 'reasoning', text: 'because' }
    ])
  })

  test('toStreamEvents renders a reasoning part from a thinking or reasoning block', () => {
    const withThinking = toStreamEvents({
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'reasoning', text: 'step one' }],
          __openclaw: { id: 'a1' }
        } as unknown as OpenClawMessage
      ]
    })
    const parts = withThinking[0]?.kind === 'turn' ? withThinking[0].turn.parts : []
    expect(parts).toContainEqual({ type: 'reasoning', text: 'step one' })
  })
})

describe('claimPreviewSource (issue: streaming preview source per run)', () => {
  test('first source to emit a delta wins the run; the other is ignored', () => {
    const rec: { previewRunId?: string; previewSource?: 'chat' | 'agent' } = {}
    // chat delta arrives first for run r1 → claims it.
    expect(claimPreviewSource(rec, 'r1', 'chat')).toBe(true)
    // agent frames for the same run are then ignored (no double-broadcast).
    expect(claimPreviewSource(rec, 'r1', 'agent')).toBe(false)
    // chat keeps streaming r1.
    expect(claimPreviewSource(rec, 'r1', 'chat')).toBe(true)
  })

  test('agent wins a run where chat never emits, and a new run re-arbitrates', () => {
    const rec: { previewRunId?: string; previewSource?: 'chat' | 'agent' } = {}
    expect(claimPreviewSource(rec, 'r1', 'agent')).toBe(true)
    expect(claimPreviewSource(rec, 'r1', 'chat')).toBe(false)
    // r2 is a fresh run — whichever source speaks first claims it.
    expect(claimPreviewSource(rec, 'r2', 'chat')).toBe(true)
    expect(claimPreviewSource(rec, 'r2', 'agent')).toBe(false)
  })
})
