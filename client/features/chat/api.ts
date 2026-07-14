import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { applyEvents } from '@/lib/format'
import type {
  SessionInfo,
  StreamEvent,
  ThreadConfig,
  ViewState,
  WorkspaceModels
} from '@/lib/types'

export function useWorkspaceSessions(workspaceId: string) {
  return useQuery<SessionInfo[]>({
    queryKey: workspaceKeys.sessions(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/sessions`),
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export function useSessionView(workspaceId: string, sessionId: string | null) {
  return useQuery<ViewState>({
    queryKey: workspaceKeys.events(workspaceId, sessionId ?? ''),
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}/events`)
      const events: StreamEvent[] = response.ok ? await response.json() : []
      return applyEvents(events)
    },
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function useWorkspaceModels(workspaceId: string) {
  return useQuery<WorkspaceModels>({
    queryKey: workspaceKeys.models(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/models`),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function useThreadConfig(workspaceId: string, sessionId: string | null) {
  return useQuery<ThreadConfig>({
    queryKey: workspaceKeys.threadConfig(workspaceId, sessionId ?? ''),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/sessions/${sessionId}/config`),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function useSaveThreadConfig(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<ThreadConfig, Error, { sessionId: string; patch: ThreadConfig }>({
    mutationFn: ({ patch, sessionId }) =>
      requestJson(
        `/api/workspaces/${workspaceId}/sessions/${sessionId}/config`,
        jsonRequest('PUT', patch),
        'Failed to save thread config'
      ),
    onSuccess: (next, { sessionId }) => {
      queryClient.setQueryData<ThreadConfig>(
        workspaceKeys.threadConfig(workspaceId, sessionId),
        next
      )
    }
  })
}
