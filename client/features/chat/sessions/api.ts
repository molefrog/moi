import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { jsonRequest, requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { sessionViewOptions } from '@/client/features/chat/sessions/session-view'
import { readSelectedSession, writeSelectedSession } from './browser-tab-state'
import {
  browserTabSelectionKey,
  browserTabSelectionOptions,
  usePinnedSession,
  useSelectedSession
} from './use-selected-session'
import { useCollabEnabled } from '@/client/features/collab'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import { useWorkspaceId } from '@/client/features/workspace/workspace-context'
import {
  changeWorkspaceStateCache,
  clearSessionInState,
  useWorkspaceState,
  useWorkspaceStateWrite,
  workspaceStateOptions
} from '@/client/features/workspace/workspace-state'
import type {
  SessionConfig,
  SessionInfo,
  SessionSummary,
  WorkspaceSessionState,
  WorkspaceState,
  WorkspaceTabId
} from '@/lib/types'
import type { BrowserTabSelection } from './browser-tab-state'

// The agent's chat list. Reading it makes the harness scan transcripts, so
// mounts within 30 s reuse it; harness `sessions_changed` frames refetch it,
// and focus picks up chats made outside Moi.
export function workspaceSessionsOptions(workspaceId: string) {
  return {
    queryKey: workspaceKeys.sessions(workspaceId),
    queryFn: () => requestJson<SessionSummary[]>(`/api/workspaces/${workspaceId}/sessions`),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  }
}

const selectSessionEntries = (state: WorkspaceState) => state.sessions

// List rows joined with the tab that owns each chat. Undefined until both
// have loaded, so view chats never flash in the overview.
export function useWorkspaceSessions(workspaceId: string): { data: SessionInfo[] | undefined } {
  const list = useQuery(workspaceSessionsOptions(workspaceId)).data
  const entries = useWorkspaceState(workspaceId, selectSessionEntries).data
  const data = useMemo(
    () =>
      list && entries
        ? list.map(session => {
            const tabId = entries[session.sessionId]?.tabId
            return tabId ? { ...session, tabId } : session
          })
        : undefined,
    [list, entries]
  )
  return { data }
}

// Select the linked chat on the destination tab, unpinning a different chat first.
export function useSelectLinkedChat() {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const collabEnabled = useCollabEnabled()
  const [, , selectSessionForTab] = useSelectedSession()
  const { unpinAsync } = usePinnedSession()
  const stateRef = useLatestRef({ collabEnabled, selectSessionForTab, unpinAsync })
  // Stable so selection updates do not restart a pending chat link.
  return useCallback(
    async (sessionId: string, tab: WorkspaceTabId, signal: AbortSignal): Promise<boolean> => {
      const { collabEnabled, selectSessionForTab, unpinAsync } = stateRef.current
      signal.throwIfAborted()
      let sessions =
        queryClient.getQueryData<SessionSummary[]>(workspaceKeys.sessions(workspaceId)) ?? []
      if (!sessions.some(session => session.sessionId === sessionId))
        // The chat may be newer than a cached list that is still fresh.
        sessions = await queryClient.fetchQuery({
          ...workspaceSessionsOptions(workspaceId),
          staleTime: 0
        })
      signal.throwIfAborted()
      if (!sessions.some(session => session.sessionId === sessionId)) return false
      const state = await queryClient.ensureQueryData(
        workspaceStateOptions(queryClient, workspaceId)
      )
      if (collabEnabled) await queryClient.ensureQueryData(browserTabSelectionOptions(workspaceId))
      signal.throwIfAborted()
      const pinned = state.pinnedSessionId
      if (pinned && pinned !== sessionId) {
        await unpinAsync()
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

export function removeArchivedSession<T extends SessionSummary>(
  sessions: T[] | undefined,
  sessionId: string
): T[] | undefined {
  return sessions?.filter(session => session.sessionId !== sessionId)
}

// Drop an archived chat everywhere this browser keeps it. The server's state
// arrives with the archive reply or a `state:changed` event.
export function applyArchivedSession(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string
) {
  const sessionsKey = workspaceKeys.sessions(workspaceId)
  void queryClient.cancelQueries({ queryKey: sessionsKey })
  queryClient.setQueryData<SessionSummary[]>(sessionsKey, current =>
    removeArchivedSession(current, sessionId)
  )
  queryClient.removeQueries({ queryKey: workspaceKeys.events(workspaceId, sessionId) })
  changeWorkspaceStateCache(queryClient, workspaceId, draft =>
    clearSessionInState(draft, sessionId)
  )
  const localKey = browserTabSelectionKey(workspaceId)
  const local =
    queryClient.getQueryData<BrowserTabSelection>(localKey) ?? readSelectedSession(workspaceId)
  if (!Object.values(local.selected).includes(sessionId)) return
  // An explicit empty local choice prevents falling back to the server's chat.
  const selected = Object.fromEntries(
    Object.entries(local.selected).map(([tabId, id]) => [tabId, id === sessionId ? null : id])
  )
  queryClient.setQueryData<BrowserTabSelection>(localKey, { selected })
  writeSelectedSession(workspaceId, { selected })
}

export function useArchiveWorkspaceSession(workspaceId: string) {
  const queryClient = useQueryClient()
  return useWorkspaceStateWrite<string>(workspaceId, {
    request: sessionId =>
      requestJson<WorkspaceState>(
        `/api/workspaces/${workspaceId}/sessions/${encodeURIComponent(sessionId)}/archive`,
        { method: 'POST' },
        'Couldn’t archive chat'
      ),
    onSuccess: (_state, sessionId) => {
      applyArchivedSession(queryClient, workspaceId, sessionId)
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.previews })
    },
    errorTitle: 'Couldn’t archive chat'
  })
}

export function useSessionView(workspaceId: string, sessionId: string | null) {
  return useQuery({
    ...sessionViewOptions(workspaceId, sessionId ?? ''),
    enabled: Boolean(sessionId)
  })
}

const NO_SESSION: WorkspaceSessionState = {}

// Moi's record of one chat: tab, settings, fork history. Undefined until the
// workspace state loads; a chat without a record reads as empty.
export function useSessionState(workspaceId: string, sessionId: string | null) {
  return useWorkspaceState(workspaceId, state =>
    sessionId ? (state.sessions[sessionId] ?? NO_SESSION) : NO_SESSION
  )
}

// null clears a setting; undefined leaves it unchanged.
export type SessionConfigPatch = { [Key in keyof SessionConfig]?: SessionConfig[Key] | null }

export function useSaveSessionConfig(workspaceId: string) {
  return useWorkspaceStateWrite<{ sessionId: string; patch: SessionConfigPatch }>(workspaceId, {
    request: ({ sessionId, patch }) =>
      requestJson<WorkspaceState>(
        `/api/workspaces/${workspaceId}/sessions/${encodeURIComponent(sessionId)}/config`,
        jsonRequest('PATCH', patch),
        'Failed to save chat settings'
      ),
    optimistic: (draft, { sessionId, patch }) => {
      const session = (draft.sessions[sessionId] ??= {})
      const config: SessionConfig = { ...session.config }
      for (const key of ['model', 'effort', 'fastMode'] as const) {
        const value = patch[key]
        if (value === null) delete config[key]
        else if (value !== undefined) Object.assign(config, { [key]: value })
      }
      session.config = config
    },
    errorTitle: 'Couldn’t save chat settings'
  })
}
