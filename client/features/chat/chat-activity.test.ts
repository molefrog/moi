// How the client reduces session-activity frames into the live store: the
// spinner state must survive lost frames (snapshot reconcile), clear on
// terminal error/stopped frames, and treat `requires-action` as a tracked but
// non-loader state.
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, test } from 'bun:test'

import { appUiKeys } from '@/client/api/app-ui-keys'
import { __setQueryClientForTests, handleFrame } from '@/client/features/chat/chat-connection'
import {
  hasRunningActivity,
  hasRunningBackgroundSession,
  hasRunningWorkspaceActivity,
  isRunningActivity,
  isSessionRunning,
  liveStore
} from '@/client/features/chat/chat-store'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { SelectedSessionState, SessionActivity, SessionInfo } from '@/lib/types'

const WS = 'ws1'
const SID = 'sess-1'

function activityOf(sessionId = SID) {
  return liveStore.getState().activity[`${WS}:${sessionId}`]
}

test('only running activity shows in-progress UI', () => {
  expect(isRunningActivity('running')).toBe(true)
  expect(isRunningActivity('requires-action')).toBe(false)
  expect(isRunningActivity('idle')).toBe(false)
  expect(isRunningActivity(undefined)).toBe(false)
})

test('workspace activity includes every session and excludes other workspaces', () => {
  const activity = {
    'ws1:idle': 'idle',
    'ws1:blocked': 'requires-action',
    'ws1:running': 'running',
    'ws2:running': 'running'
  } satisfies Record<string, SessionActivity>

  expect(hasRunningWorkspaceActivity(activity, 'ws1')).toBe(true)
  expect(hasRunningWorkspaceActivity(activity, 'ws2')).toBe(true)
  expect(hasRunningWorkspaceActivity(activity, 'ws3')).toBe(false)
  expect(
    hasRunningWorkspaceActivity(
      {
        'ws1:idle': 'idle',
        'ws1:blocked': 'requires-action',
        'ws2:running': 'running'
      },
      'ws1'
    )
  ).toBe(false)
})

test('app activity includes running sessions from any workspace', () => {
  expect(hasRunningActivity({ 'ws1:idle': 'idle', 'ws2:running': 'running' })).toBe(true)
  expect(hasRunningActivity({ 'ws1:idle': 'idle', 'ws2:blocked': 'requires-action' })).toBe(false)
})

test('background activity excludes the selected session', () => {
  const activity = {
    'ws1:selected': 'running',
    'ws1:idle': 'idle',
    'ws2:running': 'running'
  } satisfies Record<string, SessionActivity>

  expect(hasRunningBackgroundSession(activity, 'ws1', 'selected')).toBe(false)
  expect(hasRunningBackgroundSession(activity, 'ws1', 'idle')).toBe(true)
  expect(hasRunningBackgroundSession(activity, 'ws1', null)).toBe(false)
  expect(
    hasRunningBackgroundSession({ ...activity, 'ws1:other': 'running' }, 'ws1', 'selected')
  ).toBe(true)
})

test('session activity is scoped to its workspace and session', () => {
  const activity = {
    'ws1:running': 'running',
    'ws1:idle': 'idle',
    'ws2:running': 'running'
  } satisfies Record<string, SessionActivity>

  expect(isSessionRunning(activity, 'ws1', 'running')).toBe(true)
  expect(isSessionRunning(activity, 'ws1', 'idle')).toBe(false)
  expect(isSessionRunning(activity, 'ws1', 'missing')).toBe(false)
  expect(isSessionRunning(activity, 'ws2', 'running')).toBe(true)
})

beforeEach(() => {
  __setQueryClientForTests(new QueryClient())
  liveStore.setState({
    previews: {},
    activity: {},
    errors: {}
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
    const sessionsKey = workspaceKeys.sessions(WS)
    queryClient.setQueryData<SessionInfo[]>(sessionsKey, [
      { sessionId: 'temp-1', summary: 'Fix picker focus', lastModified: 1 }
    ])

    handleFrame({ type: 'session_renamed', workspaceId: WS, from: 'temp-1', to: 'real-1' })

    expect(queryClient.getQueryData<SessionInfo[]>(sessionsKey)?.[0]).toEqual({
      sessionId: 'real-1',
      summary: 'Fix picker focus',
      lastModified: 1
    })
    expect(queryClient.getQueryState(sessionsKey)?.isInvalidated).toBe(false)
  })

  test('a client without the optimistic session refreshes after the rename', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    const sessionsKey = workspaceKeys.sessions(WS)
    queryClient.setQueryData<SessionInfo[]>(sessionsKey, [
      { sessionId: 'existing', summary: 'Existing chat', lastModified: 1 }
    ])

    handleFrame({ type: 'session_renamed', workspaceId: WS, from: 'temp-1', to: 'real-1' })

    expect(queryClient.getQueryState(sessionsKey)?.isInvalidated).toBe(true)
  })

  test('an attachment-only optimistic title survives the session rename', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    const sessionsKey = workspaceKeys.sessions(WS)
    queryClient.setQueryData<SessionInfo[]>(sessionsKey, [
      { sessionId: 'temp-1', summary: 'brief.pdf', lastModified: 1 }
    ])

    handleFrame({ type: 'session_renamed', workspaceId: WS, from: 'temp-1', to: 'real-1' })

    expect(queryClient.getQueryData<SessionInfo[]>(sessionsKey)?.[0]?.summary).toBe('brief.pdf')
    expect(queryClient.getQueryState(sessionsKey)?.isInvalidated).toBe(false)
  })

  test('the current chat session follows the provider id', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    queryClient.setQueryData(appUiKeys.selectedSession(WS), {
      sessionId: 'temp-1'
    })

    handleFrame({ type: 'session_renamed', workspaceId: WS, from: 'temp-1', to: 'real-1' })

    expect(queryClient.getQueryData<SelectedSessionState>(appUiKeys.selectedSession(WS))).toEqual({
      sessionId: 'real-1'
    })
  })
})

describe('session list changes', () => {
  test('provider metadata changes refresh the complete session list', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    const sessionsKey = workspaceKeys.sessions(WS)
    queryClient.setQueryData<SessionInfo[]>(sessionsKey, [
      {
        sessionId: SID,
        summary: 'Build a customer dashboard with useful charts',
        lastModified: 1
      }
    ])

    handleFrame({ type: 'sessions_changed', workspaceId: WS, sessionId: SID })

    expect(queryClient.getQueryData<SessionInfo[]>(sessionsKey)?.[0]).toEqual({
      sessionId: SID,
      summary: 'Build a customer dashboard with useful charts',
      lastModified: 1
    })
    expect(queryClient.getQueryState(sessionsKey)?.isInvalidated).toBe(true)
  })

  test('keeps an optimistic title until the provider refetch resolves', () => {
    const queryClient = new QueryClient()
    __setQueryClientForTests(queryClient)
    const sessionsKey = workspaceKeys.sessions(WS)
    queryClient.setQueryData<SessionInfo[]>(sessionsKey, [
      {
        sessionId: 'temp-1',
        summary: 'The effort picker loses focus after opening',
        lastModified: 1
      }
    ])

    handleFrame({
      type: 'session_renamed',
      workspaceId: WS,
      from: 'temp-1',
      to: 'real-1'
    })
    handleFrame({ type: 'sessions_changed', workspaceId: WS, sessionId: 'real-1' })

    expect(queryClient.getQueryData<SessionInfo[]>(sessionsKey)?.[0]?.summary).toBe(
      'The effort picker loses focus after opening'
    )
    expect(queryClient.getQueryState(sessionsKey)?.isInvalidated).toBe(true)
  })

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
