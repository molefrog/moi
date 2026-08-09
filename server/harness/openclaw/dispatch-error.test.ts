// A run that dies during admission.
//
// `sessions.send` resolves with `status: 'started'` and a runId, so moi flips
// the composer to processing — and then the run never produces a lifecycle
// phase, because the gateway terminalized the admission itself. The only frame
// that follows is `sessions.changed { reason: 'chat.dispatch-error' }`, with no
// runId to match the active run against. Before this was handled the chat span
// forever with nothing shown.
//
// Reproduced live on gateway 2026.7.2-beta.7 by patching the session model:
// OpenClaw persists the pick into the agent's effective `model.primary`, and
// that config write bumps the prepared-model-runtime generation mid-admission
// ("prepared model runtime catalog generation was superseded").
import { describe, expect, test } from 'bun:test'

import {
  createOpenClawSessionForTest,
  handleDispatchError,
  isOpenClawProcessing,
  markProcessingForTest
} from './session'

const WORKSPACE_ID = 'ws-dispatch-error'

function newRec(sessionId: string) {
  return createOpenClawSessionForTest({
    workspaceId: WORKSPACE_ID,
    sessionId,
    sessionKey: `agent:main:dashboard:${sessionId}`
  })
}

describe('chat.dispatch-error', () => {
  test('clears processing so the composer stops spinning', () => {
    const rec = newRec('s-clears')
    // `sessions.send` returned a runId, so the send flipped the record to
    // processing. No lifecycle phase will ever follow for this run.
    markProcessingForTest(rec, 'run-superseded')
    expect(isOpenClawProcessing(WORKSPACE_ID, 's-clears')).toBe(true)

    handleDispatchError(rec)
    expect(isOpenClawProcessing(WORKSPACE_ID, 's-clears')).toBe(false)
    expect(rec.activeRunId).toBeNull()
  })

  test('is idempotent — a repeat frame leaves the session idle', () => {
    const rec = newRec('s-repeat')
    markProcessingForTest(rec, 'run-superseded')
    handleDispatchError(rec)
    handleDispatchError(rec)
    expect(isOpenClawProcessing(WORKSPACE_ID, 's-repeat')).toBe(false)
  })
})
