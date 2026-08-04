// System-message filtering at the adapter level (lib/system-messages.ts):
// user-role SDK messages that are really backend machinery — slash-command
// records, interrupt markers — become hidden synthetic turns instead of chat
// bubbles, while embedded envelopes strip out of real messages. Message
// shapes mirror what `getSessionMessages` replays from a CLI transcript.
import { describe, expect, test } from 'bun:test'

import type { StreamEvent, Turn } from '@/lib/format'

import { ClaudeAdapter } from './adapter'

let seq = 0
function userMsg(content: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
    uuid: `u-${++seq}`,
    timestamp: new Date().toISOString(),
    ...extra
  }
}

function turns(events: StreamEvent[]): Turn[] {
  return events.filter(e => e.kind === 'turn').map(e => (e as { turn: Turn }).turn)
}

// What TurnView would actually render as a user bubble.
function visibleUserTurns(all: Turn[]): Turn[] {
  return all.filter(t => t.role === 'user' && t.origin.kind === 'user-input')
}

const COMMAND_RECORD =
  '<command-name>/clear</command-name>\n' +
  '<command-message>clear</command-message>\n' +
  '<command-args></command-args>'

describe('ClaudeAdapter system-message filtering', () => {
  test('slash-command record then real prompt → one visible user bubble', () => {
    const a = new ClaudeAdapter()
    a.ingest(userMsg([{ type: 'text', text: COMMAND_RECORD }]))
    a.ingest(userMsg([{ type: 'text', text: 'Set up the MOI workspace for this project.' }]))

    const all = turns(a.hello())
    expect(all.length).toBe(2)
    const visible = visibleUserTurns(all)
    expect(visible.length).toBe(1)
    expect(visible[0].parts).toEqual([
      { type: 'text', text: 'Set up the MOI workspace for this project.' }
    ])

    // The record turn is synthetic-hidden but keeps its raw text.
    const hidden = all.find(t => t.origin.kind === 'synthetic')!
    expect(hidden.origin).toEqual({ kind: 'synthetic', reason: 'slash-command' })
    expect(hidden.parts).toEqual([{ type: 'text', text: COMMAND_RECORD }])
  })

  test('prompt then interrupt marker → one visible user bubble', () => {
    const a = new ClaudeAdapter()
    a.ingest(userMsg([{ type: 'text', text: 'рун' }]))
    a.ingest(userMsg([{ type: 'text', text: '[Request interrupted by user]' }]))

    const all = turns(a.hello())
    const visible = visibleUserTurns(all)
    expect(visible.length).toBe(1)
    expect(visible[0].parts).toEqual([{ type: 'text', text: 'рун' }])
    expect(all.find(t => t.origin.kind === 'synthetic')?.origin).toEqual({
      kind: 'synthetic',
      reason: 'interrupt'
    })
  })

  test('interrupted tool use: result still merges, marker stays hidden', () => {
    const a = new ClaudeAdapter()
    a.ingest({
      type: 'assistant',
      message: {
        role: 'assistant',
        id: 'msg_1',
        content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'ls' } }]
      },
      parent_tool_use_id: null,
      uuid: 'a-1'
    })
    a.ingest(
      userMsg([
        {
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: "The user doesn't want to proceed with this tool use.",
          is_error: true
        },
        { type: 'text', text: '[Request interrupted by user for tool use]' }
      ])
    )

    const all = turns(a.hello())
    expect(visibleUserTurns(all).length).toBe(0)
    const call = all
      .flatMap(t => t.parts)
      .find(p => p.type === 'tool-call' && p.call.toolCallId === 'tool-1')
    expect(call && call.type === 'tool-call' ? call.call.state : undefined).toBe('error')
    expect(all.find(t => t.origin.kind === 'synthetic')?.origin).toEqual({
      kind: 'synthetic',
      reason: 'interrupt'
    })
  })

  test('embedded system-reminder strips while the typed text survives', () => {
    const a = new ClaudeAdapter()
    const events = a.ingest(
      userMsg([
        {
          type: 'text',
          text: '<system-reminder>ambient context</system-reminder>\nfix the login bug'
        }
      ])
    )
    const [turn] = turns(events as StreamEvent[])
    expect(turn.origin).toEqual({ kind: 'user-input' })
    expect(turn.parts).toEqual([{ type: 'text', text: 'fix the login bug' }])
  })

  test('local command output and compact continuation are hidden', () => {
    const a = new ClaudeAdapter()
    a.ingest(
      userMsg([{ type: 'text', text: '<local-command-stdout>Compacted.</local-command-stdout>' }])
    )
    a.ingest(
      userMsg([
        {
          type: 'text',
          text: 'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.'
        }
      ])
    )
    expect(visibleUserTurns(turns(a.hello())).length).toBe(0)
  })

  test('isSynthetic messages still classify, now with rule-driven reasons', () => {
    const a = new ClaudeAdapter()
    const events = a.ingest(
      userMsg([{ type: 'text', text: COMMAND_RECORD }], { isSynthetic: true })
    )
    const [turn] = turns(events as StreamEvent[])
    expect(turn.origin).toEqual({ kind: 'synthetic', reason: 'slash-command' })
  })

  test('a user message mentioning an envelope keeps its bubble', () => {
    const a = new ClaudeAdapter()
    const text = 'why does the transcript contain <command-name> tags?'
    const events = a.ingest(userMsg([{ type: 'text', text }]))
    const [turn] = turns(events as StreamEvent[])
    expect(turn.origin).toEqual({ kind: 'user-input' })
    expect(turn.parts).toEqual([{ type: 'text', text }])
  })
})
