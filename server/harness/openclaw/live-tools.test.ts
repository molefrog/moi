// Live tool cards on the codex-app-server backend (OpenAI models on newer
// OpenClaw): tools stream as `agent`/tool frames DURING the run, but the
// durable owner rows arrive only in the run-end batch, after the assistant
// text has streamed. We render a synthetic "live tool" turn off the frame so
// the card shows up in order; the durable owner then merges onto it by re-iding
// to `livetool:<toolCallId>`. Regression guard for the duplicate-card bug: the
// run-end reconcile re-emits that durable row, and every emit must collapse
// onto the one live turn instead of dropping a second card.
import { describe, expect, test } from 'bun:test'

import type { OpenClawMessage } from './discovery'
import { createOpenClawSessionForTest, handleToolFrame, ingest } from './session'

const SESSION_KEY = 'agent:live-tools:main'
const TOOL_ID = 'exec-c5dfffcc'

function newRec() {
  return createOpenClawSessionForTest({
    workspaceId: 'ws-live-tools',
    sessionId: `s-${Math.random().toString(36).slice(2)}`,
    sessionKey: SESSION_KEY
  })
}

// Durable assistant toolCall row as the run-end batch delivers it: content
// carries the toolCall block whose `id` matches the frame's `toolCallId`.
function durableToolRow(command: string): OpenClawMessage {
  return {
    role: 'assistant',
    content: [{ type: 'toolCall', id: TOOL_ID, name: 'exec', arguments: { command } }],
    timestamp: 1785861026066,
    __openclaw: { id: 'd303c332', seq: 10 }
  } as unknown as OpenClawMessage
}

function toolTurns(rec: ReturnType<typeof newRec>) {
  return rec.view.turns.filter(t =>
    t.parts.some(p => p.type === 'tool-call' && p.call.toolCallId === TOOL_ID)
  )
}

describe('live tool card → durable owner rendezvous', () => {
  test('an agent/tool frame renders a card before any durable row exists', () => {
    const rec = newRec()
    handleToolFrame(rec, {
      data: { phase: 'start', toolCallId: TOOL_ID, name: 'exec', args: { command: 'echo red' } }
    })
    const turns = toolTurns(rec)
    expect(turns).toHaveLength(1)
    const part = turns[0].parts.find(p => p.type === 'tool-call')
    if (part?.type !== 'tool-call') throw new Error('expected a tool-call part')
    expect(part.call).toMatchObject({
      name: 'exec',
      state: 'running',
      input: { command: 'echo red' }
    })
    // The card is the run-scoped live turn, not a durable-row id.
    expect(turns[0].id).toBe(`openclaw:${SESSION_KEY}:livetool:${TOOL_ID}`)
  })

  test('the result frame flips the live card to success with output folded in', () => {
    const rec = newRec()
    handleToolFrame(rec, {
      data: { phase: 'start', toolCallId: TOOL_ID, name: 'exec', args: { command: 'echo red' } }
    })
    handleToolFrame(rec, {
      data: {
        phase: 'result',
        toolCallId: TOOL_ID,
        result: { content: [{ type: 'text', text: 'red' }] }
      }
    })
    const turns = toolTurns(rec)
    expect(turns).toHaveLength(1)
    const part = turns[0].parts.find(p => p.type === 'tool-call')
    if (part?.type !== 'tool-call') throw new Error('expected a tool-call part')
    expect(part.call).toMatchObject({ state: 'success', output: 'red' })
  })

  test('the durable owner merges onto the live card, and a reconcile re-emit stays one turn', () => {
    const rec = newRec()
    // Live frames during the run.
    handleToolFrame(rec, {
      data: { phase: 'start', toolCallId: TOOL_ID, name: 'exec', args: { command: 'echo red' } }
    })
    handleToolFrame(rec, {
      data: {
        phase: 'result',
        toolCallId: TOOL_ID,
        result: { content: [{ type: 'text', text: 'red' }] }
      }
    })
    expect(toolTurns(rec)).toHaveLength(1)

    // Run-end batch: the durable owner row lands — it must re-id onto the live
    // turn, not add a second card.
    ingest(rec, durableToolRow('echo red'))
    let turns = toolTurns(rec)
    expect(turns).toHaveLength(1)
    expect(turns[0].id).toBe(`openclaw:${SESSION_KEY}:livetool:${TOOL_ID}`)
    const part = turns[0].parts.find(p => p.type === 'tool-call')
    if (part?.type !== 'tool-call') throw new Error('expected a tool-call part')
    expect(part.call).toMatchObject({ state: 'success', output: 'red' })

    // reconcileAfterRun re-emits the same durable row. The bug deleted the
    // liveTools mapping on first merge, so this second emit kept its own id and
    // duplicated the card. Keeping the mapping means it collapses again.
    ingest(rec, durableToolRow('echo red'))
    turns = toolTurns(rec)
    expect(turns).toHaveLength(1)
    expect(turns[0].id).toBe(`openclaw:${SESSION_KEY}:livetool:${TOOL_ID}`)
  })

  test('two tool calls in one run each land as exactly one card', () => {
    const rec = newRec()
    const ids = ['exec-aaa', 'exec-bbb']
    for (const [i, id] of ids.entries()) {
      handleToolFrame(rec, {
        data: { phase: 'start', toolCallId: id, name: 'exec', args: { command: `echo ${i}` } }
      })
      handleToolFrame(rec, {
        data: {
          phase: 'result',
          toolCallId: id,
          result: { content: [{ type: 'text', text: String(i) }] }
        }
      })
    }
    // Durable owners arrive as two separate rows in the run-end batch.
    for (const [i, id] of ids.entries()) {
      ingest(rec, {
        role: 'assistant',
        content: [{ type: 'toolCall', id, name: 'exec', arguments: { command: `echo ${i}` } }],
        timestamp: 1785861026066 + i,
        __openclaw: { id: `dur-${id}`, seq: 10 + i }
      } as unknown as OpenClawMessage)
    }
    const cards = rec.view.turns.filter(t => t.parts.some(p => p.type === 'tool-call'))
    expect(cards).toHaveLength(2)
    expect(cards.map(t => t.id).sort()).toEqual(
      ids.map(id => `openclaw:${SESSION_KEY}:livetool:${id}`).sort()
    )
  })
})
