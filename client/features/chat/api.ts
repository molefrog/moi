import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { sessionViewOptions } from '@/client/features/chat/session-view'
import type { SessionConfig, SessionInfo } from '@/lib/types'

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
      queryClient.removeQueries({ queryKey: workspaceKeys.sessionConfig(workspaceId, sessionId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}

export function useSessionView(workspaceId: string, sessionId: string | null) {
  const client = useQueryClient()
  return useQuery({
    ...sessionViewOptions(client, workspaceId, sessionId ?? ''),
    enabled: Boolean(sessionId)
  })
}

export function useSessionConfig(workspaceId: string, sessionId: string | null) {
  return useQuery<SessionConfig>({
    queryKey: workspaceKeys.sessionConfig(workspaceId, sessionId ?? ''),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/sessions/${sessionId}/config`),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function useSaveSessionConfig(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<SessionConfig, Error, { sessionId: string; patch: SessionConfig }>({
    mutationFn: ({ patch, sessionId }) =>
      requestJson(
        `/api/workspaces/${workspaceId}/sessions/${sessionId}/config`,
        jsonRequest('PUT', patch),
        'Failed to save chat settings'
      ),
    onSuccess: (next, { sessionId }) => {
      queryClient.setQueryData<SessionConfig>(
        workspaceKeys.sessionConfig(workspaceId, sessionId),
        next
      )
    }
  })
}
