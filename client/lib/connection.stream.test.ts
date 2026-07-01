// Adversarial tests for how the client reduces streaming frames.
//
// These drive the REAL frame handler (`handleFrame`) against the REAL live store
// and a REAL QueryClient — no socket — so we can inject the failure modes a
// healthy WebSocket never produces on its own: dropped middle frames, reorders,
// duplicates, a mid-stream disconnect, and concurrent streams. The invariant we
// assert everywhere: the durable transcript (React Query cache) is ALWAYS
// correct and never carries preview data; a preview is at worst cosmetically
// stale, never corrupting.
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test } from 'bun:test'

import { workspaceKeys } from '@/client/api/workspaces'
import { __setQueryClientForTests, handleFrame } from '@/client/lib/connection'
import { liveStore } from '@/client/store/live'
import { emptyViewState } from '@/lib/format'
import type { PreviewBlock, Turn, ViewState } from '@/lib/types'

const WS = 'ws1'
const SID = 'sess-1'

let qc: QueryClient

beforeEach(() => {
  qc = new QueryClient()
  __setQueryClientForTests(qc)
  liveStore.setState({
    previews: {},
    processing: {},
    errors: {},
    activeByWorkspace: {},
    drafts: {}
  })
})

// --- frame builders (match server broadcast shapes) -------------------------

function previewFrame(
  messageId: string,
  blocks: PreviewBlock[],
  parentToolUseId: string | null = null,
  sessionId = SID
) {
  return { type: 'preview', workspaceId: WS, sessionId, messageId, parentToolUseId, blocks }
}
function textBlocks(text: string): PreviewBlock[] {
  return [{ index: 0, kind: 'text', text }]
}
function turnFrame(turn: Turn, sessionId = SID) {
  return { kind: 'turn', workspaceId: WS, sessionId, turn }
}
function assistantTurn(id: string, apiMessageId: string, text: string): Turn {
  return {
    id,
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts: [{ type: 'text', text }],
    meta: { apiMessageId }
  }
}
function statusFrame(processing: boolean, sessionId = SID) {
  return { type: 'status', workspaceId: WS, sessionId, processing }
}

// Prime a thread's transcript so patchView/preview-guard treat it as loaded.
function primeView(sessionId = SID) {
  qc.setQueryData<ViewState>(workspaceKeys.events(WS, sessionId), emptyViewState())
}
function view(sessionId = SID): ViewState {
  return qc.getQueryData<ViewState>(workspaceKeys.events(WS, sessionId)) ?? emptyViewState()
}
function previews() {
  return liveStore.getState().previews
}
function rootText(sessionId = SID): string | null {
  const p = Object.values(previews()).find(
    x => x.sessionId === sessionId && x.parentToolUseId === null
  )
  return p ? p.blocks.map(b => b.text).join('') : null
}

describe('streaming frame reduction', () => {
  test('preview for an UNLOADED thread is dropped (store stays bounded)', () => {
    // No primeView → view not loaded.
    handleFrame(previewFrame('msg_A', textBlocks('hello')))
    expect(Object.keys(previews())).toHaveLength(0)
  })

  test('happy path: previews accumulate, then the finalized turn clears them', () => {
    primeView()
    handleFrame(previewFrame('msg_A', textBlocks('Hel')))
    handleFrame(previewFrame('msg_A', textBlocks('Hello')))
    expect(rootText()).toBe('Hello')

    handleFrame(turnFrame(assistantTurn('t1', 'msg_A', 'Hello')))
    // Preview gone the instant the real turn lands…
    expect(rootText()).toBe(null)
    // …and the durable transcript holds exactly the finalized turn.
    expect(view().turns).toHaveLength(1)
    expect(view().turns[0].parts).toEqual([{ type: 'text', text: 'Hello' }])
  })

  test('a DROPPED middle frame self-heals (snapshots are cumulative)', () => {
    primeView()
    handleFrame(previewFrame('msg_A', textBlocks('The ')))
    // ...'The quick ' frame is lost in transit...
    handleFrame(previewFrame('msg_A', textBlocks('The quick brown fox')))
    expect(rootText()).toBe('The quick brown fox') // last snapshot wins, no gap
    handleFrame(turnFrame(assistantTurn('t1', 'msg_A', 'The quick brown fox')))
    expect(view().turns[0].parts).toEqual([{ type: 'text', text: 'The quick brown fox' }])
  })

  test('DUPLICATED and REORDERED frames never corrupt the final transcript', () => {
    primeView()
    handleFrame(previewFrame('msg_A', textBlocks('AB')))
    handleFrame(previewFrame('msg_A', textBlocks('ABCD')))
    handleFrame(previewFrame('msg_A', textBlocks('AB'))) // stale reorder arrives late
    handleFrame(previewFrame('msg_A', textBlocks('ABCD'))) // duplicate
    // The finalized turn is authoritative regardless of preview jitter.
    handleFrame(turnFrame(assistantTurn('t1', 'msg_A', 'ABCD')))
    expect(rootText()).toBe(null)
    expect(view().turns[0].parts).toEqual([{ type: 'text', text: 'ABCD' }])
  })

  test('status:false (run end) sweeps any leftover preview', () => {
    primeView()
    handleFrame(previewFrame('msg_A', textBlocks('partial')))
    expect(rootText()).toBe('partial')
    // A turn WITHOUT apiMessageId can't be cleared per-message — status:false
    // is the belt that still cleans it up.
    handleFrame(statusFrame(false))
    expect(rootText()).toBe(null)
  })

  test('error frame clears previews and sets the error', () => {
    primeView()
    handleFrame(previewFrame('msg_A', textBlocks('half')))
    handleFrame({ kind: 'error', workspaceId: WS, sessionId: SID, content: 'boom' })
    expect(rootText()).toBe(null)
    expect(liveStore.getState().errors[`${WS}:${SID}`]).toBe('boom')
  })

  test('reconnect wipes all in-flight previews (superseded by /events refetch)', () => {
    primeView()
    primeView('other')
    handleFrame(previewFrame('msg_A', textBlocks('a')))
    handleFrame(previewFrame('msg_B', textBlocks('b'), null, 'other'))
    expect(Object.keys(previews())).toHaveLength(2)
    // This is exactly what s.onopen calls after invalidateQueries.
    liveStore.getState().clearAllPreviews()
    expect(Object.keys(previews())).toHaveLength(0)
  })

  test('TTL sweep reaps a preview whose clear was somehow missed', () => {
    primeView()
    handleFrame(previewFrame('msg_A', textBlocks('stuck')))
    const entry = Object.values(previews())[0]
    // Pretend it went stale; sweep with a "now" well past its updatedAt.
    liveStore.getState().sweepPreviews(1000, entry.updatedAt + 5000)
    expect(rootText()).toBe(null)
  })

  test('CONCURRENT root + subagent previews are isolated; clearing one keeps the other', () => {
    primeView()
    handleFrame(previewFrame('msg_ROOT', textBlocks('root text'), null))
    handleFrame(previewFrame('msg_SUB', textBlocks('sub text'), 'toolu_1'))
    expect(Object.keys(previews())).toHaveLength(2)
    expect(rootText()).toBe('root text')

    // Finalize only the root message.
    handleFrame(turnFrame(assistantTurn('t1', 'msg_ROOT', 'root text')))
    expect(rootText()).toBe(null)
    // The subagent preview is untouched.
    const sub = previews()['msg_SUB']
    expect(sub?.parentToolUseId).toBe('toolu_1')
    expect(sub?.blocks[0].text).toBe('sub text')
  })

  test('session rename retargets an in-flight preview from temp id to real id', () => {
    const TEMP = 'temp-xyz'
    primeView(TEMP)
    handleFrame(previewFrame('msg_A', textBlocks('mid'), null, TEMP))
    expect(previews()['msg_A'].sessionId).toBe(TEMP)
    liveStore.getState().renameSession(WS, TEMP, 'real-abc')
    expect(previews()['msg_A'].sessionId).toBe('real-abc')
  })

  test('a full realistic run leaves a clean transcript with no preview residue', () => {
    primeView()
    // user turn (server synthesizes it), then streamed assistant, then result.
    handleFrame(
      turnFrame({
        id: 'u1',
        role: 'user',
        origin: { kind: 'user-input' },
        parts: [{ type: 'text', text: 'hi' }]
      })
    )
    handleFrame(statusFrame(true))
    for (const t of ['H', 'He', 'Hel', 'Hell', 'Hello']) {
      handleFrame(previewFrame('msg_A', textBlocks(t)))
    }
    handleFrame(turnFrame(assistantTurn('a1', 'msg_A', 'Hello')))
    handleFrame({ kind: 'result', workspaceId: WS, sessionId: SID, result: { subtype: 'success' } })
    handleFrame(statusFrame(false))

    expect(Object.keys(previews())).toHaveLength(0)
    const turns = view().turns
    expect(turns).toHaveLength(2)
    expect(turns[0].role).toBe('user')
    expect(turns[1].role).toBe('assistant')
    expect(turns[1].parts).toEqual([{ type: 'text', text: 'Hello' }])
    // No preview-shaped junk leaked into the transcript.
    expect(liveStore.getState().processing[`${WS}:${SID}`]).toBe(false)
  })
})
