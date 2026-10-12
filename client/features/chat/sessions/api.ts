import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { sessionViewOptions } from '@/client/features/chat/sessions/session-view'
import { readSelectedSession, writeSelectedSession } from './browser-tab-state'
import {
  selectedSessionKey,
  selectedSessionOptions,
  usePinnedSession,
  useSelectedSession
} from './useSelectedSession'
import { useCollabEnabled } from '@/client/features/collab'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import type {
  SessionConfig,
  SessionInfo,
  SessionRecord,
  WorkspaceSessionSelection,
  WorkspaceTabId
} from '@/lib/types'

export function workspaceSessionsOptions(workspaceId: string) {
  return {
    queryKey: workspaceKeys.sessions(workspaceId),
    queryFn: () => requestJson<SessionInfo[]>(`/api/workspaces/${workspaceId}/sessions`),
    ...WORKSPACE_RESOURCE_OPTIONS
  }
}

export function useWorkspaceSessions(workspaceId: string) {
  return useQuery(workspaceSessionsOptions(workspaceId))
}

// Select the linked chat on the destination tab, unpinning a different chat first.
export function useSelectLinkedChat() {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const collabEnabled = useCollabEnabled()
  const [, , selectSessionForTab] = useSelectedSession()
  const { pinAsync } = usePinnedSession()
  const stateRef = useLatestRef({ collabEnabled, selectSessionForTab, pinAsync })
  // Stable so selection updates do not restart a pending chat link.
  return useCallback(
    async (sessionId: string, tab: WorkspaceTabId, signal: AbortSignal): Promise<boolean> => {
      const { collabEnabled, selectSessionForTab, pinAsync } = stateRef.current
      signal.throwIfAborted()
      let sessions =
        queryClient.getQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId)) ?? []
      if (!sessions.some(session => session.sessionId === sessionId))
        sessions = await queryClient.fetchQuery(workspaceSessionsOptions(workspaceId))
      signal.throwIfAborted()
      if (!sessions.some(session => session.sessionId === sessionId)) return false
      await queryClient.ensureQueryData(selectedSessionOptions(workspaceId))
      if (collabEnabled)
        await queryClient.ensureQueryData(selectedSessionOptions(workspaceId, 'browser-tab'))
      signal.throwIfAborted()
      const pinned = queryClient.getQueryData<WorkspaceSessionSelection>(
        selectedSessionKey(workspaceId)
      )?.pinned
      if (pinned && pinned !== sessionId) {
        await pinAsync(null)
        signal.throwIfAborted()
      }
      if (pinned !== sessionId) {
        await selectSessionForTab(sessionId, tab)
        signal.throwIfAborted()
      }
      return true
    },
    [queryClient, stateRef, workspaceId]
  )
}

export function removeArchivedSession(
  sessions: SessionInfo[] | undefined,
  sessionId: string
): SessionInfo[] | undefined {
  return sessions?.filter(session => session.sessionId !== sessionId)
}

export function applyArchivedSession(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string
) {
  const sessionsKey = workspaceKeys.sessions(workspaceId)
  void queryClient.cancelQueries({ queryKey: sessionsKey })
  queryClient.setQueryData<SessionInfo[]>(sessionsKey, current =>
    removeArchivedSession(current, sessionId)
  )
  queryClient.removeQueries({ queryKey: workspaceKeys.events(workspaceId, sessionId) })
  queryClient.removeQueries({ queryKey: workspaceKeys.session(workspaceId, sessionId) })
  for (const scope of ['shared', 'browser-tab'] as const) {
    const key = selectedSessionKey(workspaceId, scope)
    const current =
      queryClient.getQueryData<WorkspaceSessionSelection>(key) ??
      (scope === 'browser-tab' ? readSelectedSession(workspaceId) : undefined)
    if (!current) continue
    let changed = current.pinned === sessionId
    const selected = Object.fromEntries(Object.entries(current.selected))
    for (const [tabId, id] of Object.entries(selected)) {
      if (id !== sessionId) continue
      changed = true
      // An explicit empty local choice prevents falling back to the server's chat.
      if (scope === 'browser-tab') selected[tabId] = null
      else delete selected[tabId]
    }
    if (!changed) continue
    const next = { selected, pinned: current.pinned === sessionId ? null : current.pinned }
    queryClient.setQueryData(key, next)
    if (scope === 'browser-tab') writeSelectedSession(workspaceId, next)
  }
  void queryClient.invalidateQueries({ queryKey: selectedSessionKey(workspaceId), exact: true })
}

export function useArchiveWorkspaceSession(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: sessionId =>
      requestVoid(
        `/api/workspaces/${workspaceId}/sessions/${sessionId}/archive`,
        { method: 'POST' },
        'Couldn’t archive chat'
      ),
    onSuccess: (_, sessionId) => {
      applyArchivedSession(queryClient, workspaceId, sessionId)
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}

export function useSessionView(workspaceId: string, sessionId: string | null) {
  return useQuery({
    ...sessionViewOptions(workspaceId, sessionId ?? ''),
    enabled: Boolean(sessionId)
  })
}

export function useSession(workspaceId: string, sessionId: string | null) {
  return useQuery<SessionRecord>({
    queryKey: workspaceKeys.session(workspaceId, sessionId ?? ''),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function useSaveSessionConfig(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<SessionRecord, Error, { sessionId: string; patch: SessionConfig }>({
    mutationFn: ({ patch, sessionId }) =>
      requestJson(
        `/api/workspaces/${workspaceId}/sessions/${sessionId}/config`,
        jsonRequest('PUT', patch),
        'Failed to save chat settings'
      ),
    onSuccess: (next, { sessionId }) => {
      queryClient.setQueryData<SessionRecord>(workspaceKeys.session(workspaceId, sessionId), next)
    }
  })
}
