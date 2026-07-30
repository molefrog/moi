// How the client reduces session-activity frames into the live store: the
// spinner state must survive lost frames (snapshot reconcile), clear on
// terminal error/stopped frames, and treat `requires-action` as a tracked but
// non-loader state.
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test } from 'bun:test'

import { __setQueryClientForTests, handleFrame } from '@/client/features/chat/chat-connection'
import { liveStore } from '@/client/features/chat/chat-store'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { SessionInfo } from '@/lib/types'

const WS = 'ws1'
const SID = 'sess-1'

function activityOf(sessionId = SID) {
  return liveStore.getState().activity[`${WS}:${sessionId}`]
}

beforeEach(() => {
  __setQueryClientForTests(new QueryClient())
  liveStore.setState({
    previews: {},
    activity: {},
    errors: {},
    activeByWorkspace: {}
  })
})

describe('status frames', () => {
  test('status frames mirror activity into the store', () => {
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'running' })
    expect(activityOf()).toBe('running')
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'requires-action' })
    expect(activityOf()).toBe('requires-action')
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'idle' })
    expect(activityOf()).toBe('idle')
  })

  test('error frame is terminal: clears activity and records the error', () => {
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'running' })
    handleFrame({ kind: 'error', workspaceId: WS, sessionId: SID, content: 'boom' })
    expect(activityOf()).toBe('idle')
    expect(liveStore.getState().errors[`${WS}:${SID}`]).toBe('boom')
  })

  test('stopped frame clears activity', () => {
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'running' })
    handleFrame({ kind: 'stopped', workspaceId: WS, sessionId: SID })
    expect(activityOf()).toBe('idle')
  })
})

describe('status_snapshot reconcile', () => {
  test('sessions absent from the snapshot are cleared (lost terminal frame heals)', () => {
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'running' })
    handleFrame({ type: 'status', workspaceId: WS, sessionId: 'other', activity: 'running' })
    handleFrame({
      type: 'status_snapshot',
      sessions: [{ workspaceId: WS, sessionId: 'other', activity: 'running' }]
    })
    expect(activityOf()).toBeUndefined()
    expect(activityOf('other')).toBe('running')
  })

  test('snapshot carries non-running activity through', () => {
    handleFrame({
      type: 'status_snapshot',
      sessions: [{ workspaceId: WS, sessionId: SID, activity: 'requires-action' }]
    })
    expect(activityOf()).toBe('requires-action')
  })

  test('empty snapshot clears everything', () => {
    handleFrame({ type: 'status', workspaceId: WS, sessionId: SID, activity: 'running' })
    handleFrame({ type: 'status_snapshot', sessions: [] })
    expect(liveStore.getState().activity).toEqual({})
  })
})

describe('session rename', () => {
  test('activity migrates from the temp id to the real id', () => {
    handleFrame({ type: 'status', workspaceId: WS, sessionId: 'temp-1', activity: 'running' })
    handleFrame({ type: 'session_renamed', workspaceId: WS, from: 'temp-1', to: 'real-1' })
    expect(activityOf('temp-1')).toBeUndefined()
    expect(activityOf('real-1')).toBe('running')
  })

  test('the optimistic title follows the real session id', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    queryClient.setQueryData<SessionInfo[]>(workspaceKeys.sessions(WS), [
      { sessionId: 'temp-1', summary: 'Fix picker focus', lastModified: 1 }
    ])

    handleFrame({ type: 'session_renamed', workspaceId: WS, from: 'temp-1', to: 'real-1' })

    expect(queryClient.getQueryData<SessionInfo[]>(workspaceKeys.sessions(WS))?.[0]).toEqual({
      sessionId: 'real-1',
      summary: 'Fix picker focus',
      lastModified: 1
    })
  })
})

describe('session list changes', () => {
  test('invalidates the affected workspace session list and preview', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    queryClient.setQueryData(workspaceKeys.sessions(WS), [])
    queryClient.setQueryData(workspaceKeys.preview(WS), {})

    handleFrame({ type: 'sessions_changed', workspaceId: WS, sessionId: SID })

    expect(queryClient.getQueryState(workspaceKeys.sessions(WS))?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(workspaceKeys.preview(WS))?.isInvalidated).toBe(true)
  })
})
