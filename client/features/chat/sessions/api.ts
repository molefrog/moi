import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { sessionViewOptions } from '@/client/features/chat/sessions/session-view'
import { useCollabEnabled } from '@/client/features/collab'
import { readSelectedSession, writeSelectedSession } from './browser-tab-state'
import { selectedSessionKey } from './useSelectedSession'
import type {
  SessionConfig,
  SessionInfo,
  SessionRecord,
  WorkspaceSessionSelection
} from '@/lib/types'

export function useWorkspaceSessions(workspaceId: string) {
  return useQuery<SessionInfo[]>({
    queryKey: workspaceKeys.sessions(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/sessions`),
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export function removeArchivedSession(
  sessions: SessionInfo[] | undefined,
  sessionId: string
): SessionInfo[] | undefined {
  return sessions?.filter(session => session.sessionId !== sessionId)
}

export function useArchiveWorkspaceSession(workspaceId: string) {
  const collabEnabled = useCollabEnabled()
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: sessionId =>
      requestVoid(
        `/api/workspaces/${workspaceId}/sessions/${sessionId}/archive`,
        { method: 'POST' },
        'Couldn’t archive chat'
      ),
    onSuccess: (_, sessionId) => {
      queryClient.setQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId), current =>
        removeArchivedSession(current, sessionId)
      )
      queryClient.removeQueries({ queryKey: workspaceKeys.events(workspaceId, sessionId) })
      queryClient.removeQueries({ queryKey: workspaceKeys.session(workspaceId, sessionId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
      if (collabEnabled) {
        const localKey = selectedSessionKey(workspaceId, 'browser-tab')
        const local =
          queryClient.getQueryData<WorkspaceSessionSelection>(localKey) ??
          readSelectedSession(workspaceId)
        const selected = Object.fromEntries(
          Object.entries(local.selected).filter(([, id]) => id !== sessionId)
        )
        const next = { selected, pinned: null }
        queryClient.setQueryData(localKey, next)
        writeSelectedSession(workspaceId, next)
      }
      void queryClient.invalidateQueries({ queryKey: selectedSessionKey(workspaceId), exact: true })
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
