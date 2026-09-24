import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import { appUiKeys } from '@/client/api/app-ui-keys'
import {
  applySelectedSessionEvent,
  optimisticallySetSelectedSession,
  settleSelectedSessionSave
} from '@/client/features/chat/sessions/useSelectedSession'
import type { WorkspaceSessionSelection } from '@/lib/types'

const WORKSPACE_ID = 'workspace-1'

function selectedSessionId(queryClient: QueryClient): string | null | undefined {
  return queryClient.getQueryData<WorkspaceSessionSelection>(
    appUiKeys.sessionSelection(WORKSPACE_ID)
  )?.selected.overview
}

describe('selected session cache', () => {
  test('settling one tab preserves other tab selections and the workspace pin', () => {
    const queryClient = new QueryClient()
    const key = appUiKeys.sessionSelection(WORKSPACE_ID)
    queryClient.setQueryData<WorkspaceSessionSelection>(key, {
      selected: { overview: 'old' },
      pinned: 'pin'
    })
    const input = optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'next', 'overview')!
    optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'notes', 'scratchpad')
    settleSelectedSessionSave(queryClient, WORKSPACE_ID, { sessionId: 'next' }, input)
    expect(queryClient.getQueryData<WorkspaceSessionSelection>(key)).toEqual({
      selected: { overview: 'next', scratchpad: 'notes' },
      pinned: 'pin'
    })
  })
  test('workspace prefix invalidates every tab without affecting another workspace', async () => {
    const queryClient = new QueryClient()
    const keys = [appUiKeys.sessionSelection(WORKSPACE_ID)]
    const other = appUiKeys.sessionSelection('other-workspace')
    for (const key of [...keys, other])
      queryClient.setQueryData(key, { selected: {}, pinned: null })

    await queryClient.invalidateQueries({ queryKey: appUiKeys.sessionSelection(WORKSPACE_ID) })

    for (const key of keys) expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false)
  })

  test('uses an app UI key outside the workspace resource cache', () => {
    expect(appUiKeys.sessionSelection(WORKSPACE_ID)).toEqual([
      'app-ui',
      'session-selection',
      WORKSPACE_ID
    ])
  })

  test('updates a chat selection and New chat optimistically', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<WorkspaceSessionSelection>(appUiKeys.sessionSelection(WORKSPACE_ID), {
      selected: { overview: 'session-1' },
      pinned: null
    })

    expect(
      optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'session-2', 'overview')
    ).toEqual({
      sessionId: 'session-2',
      tabId: 'overview',
      previousSessionId: 'session-1'
    })
    expect(selectedSessionId(queryClient)).toBe('session-2')

    expect(optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, null, 'overview')).toEqual({
      sessionId: null,
      tabId: 'overview',
      previousSessionId: 'session-2'
    })
    expect(selectedSessionId(queryClient)).toBeUndefined()
    expect(
      settleSelectedSessionSave(
        queryClient,
        WORKSPACE_ID,
        { sessionId: null },
        {
          sessionId: null,
          previousSessionId: 'session-2',
          tabId: 'overview'
        }
      )
    ).toBe('applied')
    expect(selectedSessionId(queryClient)).toBeUndefined()
  })

  test('keeps the latest optimistic selection while serialized saves settle', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<WorkspaceSessionSelection>(appUiKeys.sessionSelection(WORKSPACE_ID), {
      selected: { overview: 'session-1' },
      pinned: null
    })

    const first = optimisticallySetSelectedSession(
      queryClient,
      WORKSPACE_ID,
      'session-2',
      'overview'
    )
    const second = optimisticallySetSelectedSession(
      queryClient,
      WORKSPACE_ID,
      'session-3',
      'overview'
    )
    if (!first || !second) throw new Error('Expected optimistic updates')

    expect(
      settleSelectedSessionSave(queryClient, WORKSPACE_ID, { sessionId: 'session-2' }, first)
    ).toBe('ignored')
    expect(selectedSessionId(queryClient)).toBe('session-3')

    expect(
      settleSelectedSessionSave(queryClient, WORKSPACE_ID, { sessionId: 'session-3' }, second)
    ).toBe('applied')
    expect(selectedSessionId(queryClient)).toBe('session-3')
  })

  test('detects a rejected conditional save without replacing the optimistic value', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<WorkspaceSessionSelection>(appUiKeys.sessionSelection(WORKSPACE_ID), {
      selected: { overview: 'session-1' },
      pinned: null
    })
    const input = optimisticallySetSelectedSession(
      queryClient,
      WORKSPACE_ID,
      'session-2',
      'overview'
    )
    if (!input) throw new Error('Expected optimistic update')

    expect(
      settleSelectedSessionSave(queryClient, WORKSPACE_ID, { sessionId: 'session-1' }, input)
    ).toBe('conflict')
    expect(selectedSessionId(queryClient)).toBe('session-2')
  })

  test('applies cross-client events only when no local save is pending', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<WorkspaceSessionSelection>(appUiKeys.sessionSelection(WORKSPACE_ID), {
      selected: { overview: 'local-session' },
      pinned: null
    })

    applySelectedSessionEvent(queryClient, WORKSPACE_ID, true)
    expect(selectedSessionId(queryClient)).toBe('local-session')
    expect(queryClient.getQueryState(appUiKeys.sessionSelection(WORKSPACE_ID))?.isInvalidated).toBe(
      false
    )

    applySelectedSessionEvent(queryClient, WORKSPACE_ID, false)
    expect(queryClient.getQueryState(appUiKeys.sessionSelection(WORKSPACE_ID))?.isInvalidated).toBe(
      true
    )
    expect(selectedSessionId(queryClient)).toBe('local-session')
  })
})
