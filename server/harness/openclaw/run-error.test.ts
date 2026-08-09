// A failed run has to say why.
//
// The frames below are verbatim from a live 2026.7.1 capture of a
// `claude-cli/claude-sonnet-5` run that could not start. The gateway said
// exactly what was wrong, three times over, and the chat used to show none of
// it — the spinner stopped and nothing else happened.
import { describe, expect, test } from 'bun:test'

import { createOpenClawSessionForTest, reportRunError } from './session'
import { addClient, removeClient } from '../../state'

const RUN_ID = 'dd89cd14-172f-4aea-87be-7a1c3de16c98'
const REASON =
  '--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons'

type Frame = { kind?: string; sessionId?: string; content?: string; workspaceId?: string }

// Everything a connected chat tab would receive while `fn` runs. `addClient`
// wants a live WebSocket; the broadcaster only ever calls `send`, so a stub
// with that one method stands in (cast through `unknown` — there is no
// narrower type for "the part of a socket this code touches").
function withBroadcasts(fn: () => void): Frame[] {
  const seen: Frame[] = []
  const stub = { send: (json: string) => seen.push(JSON.parse(json) as Frame) }
  const client = stub as unknown as Bun.ServerWebSocket<unknown>
  addClient(client)
  try {
    fn()
  } finally {
    removeClient(client)
  }
  return seen
}

function newRec(workspaceId: string) {
  return createOpenClawSessionForTest({
    workspaceId,
    sessionId: 'run-error',
    sessionKey: 'agent:main:dashboard:f4fe7a00'
  })
}

describe('run failures reach the user', () => {
  test('the reason is broadcast as an error', () => {
    const rec = newRec('ws-run-error-1')
    const seen = withBroadcasts(() => reportRunError(rec, RUN_ID, REASON))
    expect(seen).toContainEqual({
      kind: 'error',
      sessionId: 'run-error',
      content: REASON,
      workspaceId: 'ws-run-error-1'
    })
  })

  test('a run reports once, however many frames carry the failure', () => {
    const rec = newRec('ws-run-error-2')
    const seen = withBroadcasts(() => {
      // `chat` state=error, then `agent`/lifecycle phase=error, then the
      // gateway's own wrapped retelling — all for the same run.
      reportRunError(rec, RUN_ID, REASON)
      reportRunError(rec, RUN_ID, REASON)
      reportRunError(rec, RUN_ID, `⚠️ Agent failed before reply: ${REASON}.`)
    })
    expect(seen.filter(m => m.kind === 'error')).toHaveLength(1)
  })

  test('a later run can still report its own failure', () => {
    const rec = newRec('ws-run-error-3')
    const seen = withBroadcasts(() => {
      reportRunError(rec, RUN_ID, REASON)
      reportRunError(rec, 'a-second-run', 'model not allowed: openai/gpt-5.5')
    })
    expect(seen.filter(m => m.kind === 'error')).toHaveLength(2)
  })

  test('a frame with no text says nothing rather than an empty bubble', () => {
    const rec = newRec('ws-run-error-4')
    const seen = withBroadcasts(() => {
      // `sessions.changed { phase: 'error' }` carries no reason at all.
      reportRunError(rec, RUN_ID, undefined)
      reportRunError(rec, RUN_ID, '   ')
    })
    expect(seen.filter(m => m.kind === 'error')).toHaveLength(0)
    // …and the run is not marked as reported, so the frame that does carry the
    // reason still gets through.
    const after = withBroadcasts(() => reportRunError(rec, RUN_ID, REASON))
    expect(after).toHaveLength(1)
  })
})
