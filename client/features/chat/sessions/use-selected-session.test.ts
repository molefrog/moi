import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import { workspaceKeys } from '@/client/api/workspace-keys'
import type { BrowserTabSelection } from '@/client/features/chat/sessions/browser-tab-state'
import {
  browserTabSelectionKey,
  cachedSelectedSession,
  renameSelectedSessionInCache,
  selectedSessionForTab,
  setSelectedSessionInCache
} from '@/client/features/chat/sessions/use-selected-session'
import type { WorkspaceState } from '@/lib/types'

const WORKSPACE_ID = 'workspace-1'

function workspaceState(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return { revision: 1, selected: {}, sessions: {}, pendingViews: {}, ...patch }
}

function cachedState(queryClient: QueryClient): WorkspaceState | undefined {
  return queryClient.getQueryData<WorkspaceState>(workspaceKeys.state(WORKSPACE_ID))
}

describe('selected session', () => {
  test('a CLI-created view chat is selected until this browser tab chooses otherwise', () => {
    const tabId = 'views/new-view' as const
    const state = workspaceState({ selected: { [tabId]: 'cli-child' } })
    expect(selectedSessionForTab(state, tabId, { selected: {} })).toBe('cli-child')
    expect(selectedSessionForTab(state, tabId, { selected: { [tabId]: null } })).toBeNull()
    expect(selectedSessionForTab({ ...state, pinnedSessionId: 'pinned-chat' }, tabId)).toBe(
      'pinned-chat'
    )
  })

  test('is unknown until the workspace state loads', () => {
    expect(selectedSessionForTab(undefined, 'overview')).toBeUndefined()
    expect(selectedSessionForTab(workspaceState(), 'overview')).toBeNull()
  })

  test('showing a chat in one tab keeps other tabs and the workspace pin', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      workspaceKeys.state(WORKSPACE_ID),
      workspaceState({ selected: { overview: 'old' }, pinnedSessionId: 'pin' })
    )
    setSelectedSessionInCache(queryClient, WORKSPACE_ID, 'next', 'overview', 'shared')
    setSelectedSessionInCache(queryClient, WORKSPACE_ID, 'notes', 'scratchpad', 'shared')
    expect(cachedState(queryClient)).toMatchObject({
      selected: { overview: 'next', scratchpad: 'notes' },
      pinnedSessionId: 'pin'
    })
  })

  test('a browser tab choice leaves the workspace selection alone', () => {
    const queryClient = new QueryClient()
    const state = workspaceState({ selected: { overview: 'shared-chat' } })
    queryClient.setQueryData(workspaceKeys.state(WORKSPACE_ID), state)
    queryClient.setQueryData<BrowserTabSelection>(browserTabSelectionKey(WORKSPACE_ID), {
      selected: {}
    })
    setSelectedSessionInCache(queryClient, WORKSPACE_ID, 'local-chat', 'overview', 'browser-tab')

    expect(cachedState(queryClient)).toBe(state)
    expect(cachedSelectedSession(queryClient, WORKSPACE_ID, 'overview', 'browser-tab')).toBe(
      'local-chat'
    )
    expect(cachedSelectedSession(queryClient, WORKSPACE_ID, 'overview', 'shared')).toBe(
      'shared-chat'
    )
  })

  test('a renamed chat keeps its tabs, pin, settings, fork children, and build', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      workspaceKeys.state(WORKSPACE_ID),
      workspaceState({
        pinnedSessionId: 'temp',
        selected: { overview: 'temp', 'views/board': 'temp' },
        sessions: {
          temp: { tabId: 'views/board', config: { model: 'sonnet' } },
          child: { fork: { fromSessionId: 'temp' } }
        },
        pendingViews: { board: { status: 'starting', requirements: '', buildSessionId: 'temp' } }
      })
    )
    queryClient.setQueryData<BrowserTabSelection>(browserTabSelectionKey(WORKSPACE_ID), {
      selected: { 'views/board': 'temp' }
    })

    renameSelectedSessionInCache(queryClient, WORKSPACE_ID, 'temp', 'real')

    expect(cachedState(queryClient)).toEqual(
      workspaceState({
        pinnedSessionId: 'real',
        selected: { overview: 'real', 'views/board': 'real' },
        sessions: {
          real: { tabId: 'views/board', config: { model: 'sonnet' } },
          child: { fork: { fromSessionId: 'real' } }
        },
        pendingViews: { board: { status: 'starting', requirements: '', buildSessionId: 'real' } }
      })
    )
    expect(
      queryClient.getQueryData<BrowserTabSelection>(browserTabSelectionKey(WORKSPACE_ID))
    ).toEqual({ selected: { 'views/board': 'real' } })
  })

  test('the browser tab choice uses an app UI key outside the workspace resource cache', () => {
    expect(browserTabSelectionKey(WORKSPACE_ID)).toEqual([
      'app-ui',
      'browser-tab-selection',
      WORKSPACE_ID
    ])
  })
})
