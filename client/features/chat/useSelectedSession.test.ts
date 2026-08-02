import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test } from 'bun:test'

import { appUiKeys } from '@/client/api/app-ui-keys'
import {
  applySelectedSessionEvent,
  optimisticallySetSelectedSession,
  settleSelectedSessionSave
} from '@/client/features/chat/useSelectedSession'
import type { SelectedSessionState } from '@/lib/types'

const WORKSPACE_ID = 'workspace-1'

function selectedSessionId(queryClient: QueryClient): string | null | undefined {
  return queryClient.getQueryData<SelectedSessionState>(appUiKeys.selectedSession(WORKSPACE_ID))
    ?.sessionId
}

describe('selected session cache', () => {
  test('uses an app UI key outside the workspace resource cache', () => {
    expect(appUiKeys.selectedSession(WORKSPACE_ID)).toEqual([
      'app-ui',
      'selected-session',
      WORKSPACE_ID
    ])
  })

  test('updates a chat selection and New chat optimistically', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<SelectedSessionState>(appUiKeys.selectedSession(WORKSPACE_ID), {
      sessionId: 'session-1'
    })

    expect(optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'session-2')).toEqual({
      sessionId: 'session-2',
      previousSessionId: 'session-1'
    })
    expect(selectedSessionId(queryClient)).toBe('session-2')

    expect(optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, null)).toEqual({
      sessionId: null,
      previousSessionId: 'session-2'
    })
    expect(selectedSessionId(queryClient)).toBeNull()
  })

  test('keeps the latest optimistic selection while serialized saves settle', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<SelectedSessionState>(appUiKeys.selectedSession(WORKSPACE_ID), {
      sessionId: 'session-1'
    })

    const first = optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'session-2')
    const second = optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'session-3')
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
    queryClient.setQueryData<SelectedSessionState>(appUiKeys.selectedSession(WORKSPACE_ID), {
      sessionId: 'session-1'
    })
    const input = optimisticallySetSelectedSession(queryClient, WORKSPACE_ID, 'session-2')
    if (!input) throw new Error('Expected optimistic update')

    expect(
      settleSelectedSessionSave(queryClient, WORKSPACE_ID, { sessionId: 'session-1' }, input)
    ).toBe('conflict')
    expect(selectedSessionId(queryClient)).toBe('session-2')
  })

  test('applies cross-client events only when no local save is pending', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData<SelectedSessionState>(appUiKeys.selectedSession(WORKSPACE_ID), {
      sessionId: 'local-session'
    })

    applySelectedSessionEvent(queryClient, WORKSPACE_ID, 'server-session', true)
    expect(selectedSessionId(queryClient)).toBe('local-session')

    applySelectedSessionEvent(queryClient, WORKSPACE_ID, 'server-session', false)
    expect(selectedSessionId(queryClient)).toBe('server-session')
  })
})
