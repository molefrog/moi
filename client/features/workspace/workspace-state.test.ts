import { QueryClient } from '@tanstack/react-query'
import { describe, expect, spyOn, test } from 'bun:test'

import { workspaceKeys } from '@/client/api/workspace-keys'
import type { WorkspaceState } from '@/lib/types'
import {
  changeWorkspaceStateCache,
  clearSessionInState,
  receiveWorkspaceState,
  workspaceStateOptions
} from './workspace-state'

const WORKSPACE_ID = 'workspace-1'

function workspaceState(patch: Partial<WorkspaceState> = {}): WorkspaceState {
  return { revision: 1, selected: {}, sessions: {}, pendingViews: {}, ...patch }
}

function cached(queryClient: QueryClient): WorkspaceState | undefined {
  return queryClient.getQueryData<WorkspaceState>(workspaceKeys.state(WORKSPACE_ID))
}

describe('workspace state cache', () => {
  test('a copy older than the cached one never replaces it', () => {
    const queryClient = new QueryClient()
    receiveWorkspaceState(queryClient, WORKSPACE_ID, workspaceState({ revision: 5 }))
    receiveWorkspaceState(
      queryClient,
      WORKSPACE_ID,
      workspaceState({ revision: 4, pinnedSessionId: 'stale' })
    )
    expect(cached(queryClient)).toEqual(workspaceState({ revision: 5 }))

    const next = workspaceState({ revision: 6, pinnedSessionId: 'fresh' })
    receiveWorkspaceState(queryClient, WORKSPACE_ID, next)
    expect(cached(queryClient)).toEqual(next)
  })

  test('a local change edits a copy and needs a loaded state', () => {
    const queryClient = new QueryClient()
    changeWorkspaceStateCache(queryClient, WORKSPACE_ID, draft => {
      draft.pinnedSessionId = 'chat'
    })
    expect(cached(queryClient)).toBeUndefined()

    const loaded = workspaceState({ selected: { overview: 'chat' } })
    queryClient.setQueryData(workspaceKeys.state(WORKSPACE_ID), loaded)
    changeWorkspaceStateCache(queryClient, WORKSPACE_ID, draft => {
      draft.selected.overview = 'other'
    })
    expect(cached(queryClient)?.selected.overview).toBe('other')
    expect(loaded.selected.overview).toBe('chat')
  })

  test('an archived chat leaves every tab and the pin', () => {
    const state = workspaceState({
      pinnedSessionId: 'archived',
      selected: { overview: 'archived', scratchpad: 'kept' },
      sessions: { archived: { tabId: 'scratchpad' } }
    })
    clearSessionInState(state, 'archived')
    expect(state).toEqual(
      workspaceState({
        selected: { scratchpad: 'kept' },
        sessions: { archived: { tabId: 'scratchpad' } }
      })
    )
  })

  test('a refetch that lands after a newer event keeps the newer copy', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const options = workspaceStateOptions(queryClient, WORKSPACE_ID)
    const newer = workspaceState({ revision: 8, pinnedSessionId: 'from-event' })
    const request = spyOn(globalThis, 'fetch').mockImplementation(
      Object.assign(
        async () => {
          receiveWorkspaceState(queryClient, WORKSPACE_ID, newer)
          return Response.json(workspaceState({ revision: 7 }))
        },
        { preconnect: fetch.preconnect }
      )
    )
    try {
      await queryClient.fetchQuery(options)
      expect(cached(queryClient)).toEqual(newer)
      expect(String(request.mock.calls[0]?.[0])).toBe(`/api/workspaces/${WORKSPACE_ID}/state`)
    } finally {
      request.mockRestore()
      queryClient.clear()
    }
  })
})
