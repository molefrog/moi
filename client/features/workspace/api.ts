import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type {
  HarnessAvailability,
  ViewInfo,
  WidgetInfo,
  WorkspaceLayout,
  WorkspaceType
} from '@/lib/types'

export type WorkspaceLayoutResponse = WorkspaceLayout & {
  cwd: string
  name: string
  provider?: WorkspaceType
  agentId?: string
}

export function useWorkspaceLayout(workspaceId: string) {
  return useQuery<WorkspaceLayoutResponse>({
    queryKey: workspaceKeys.layout(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}`),
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

// Is the workspace's agent executable installed? Drives the Send button's
// disabled state and tooltip. Refetches on window focus so installing the
// missing runtime and returning to the tab unlocks the composer.
export function useWorkspaceAvailability(workspaceId: string) {
  return useQuery<HarnessAvailability>({
    queryKey: workspaceKeys.availability(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/availability`),
    staleTime: 30_000,
    refetchOnWindowFocus: true
  })
}

export function useWorkspaceWidgets(workspaceId: string) {
  return useQuery<WidgetInfo[]>({
    queryKey: workspaceKeys.widgets(workspaceId),
    queryFn: async () => {
      const data = await requestJson<{ widgets: WidgetInfo[] }>(
        `/api/workspaces/${workspaceId}/widgets`
      )
      return data.widgets
    },
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export function useWorkspaceViews(workspaceId: string) {
  return useQuery<ViewInfo[]>({
    queryKey: workspaceKeys.views(workspaceId),
    queryFn: async () => {
      const data = await requestJson<{ views: ViewInfo[] }>(`/api/workspaces/${workspaceId}/views`)
      return data.views
    },
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export function useSaveLayout(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, WorkspaceLayout>({
    mutationFn: layout =>
      requestVoid(
        `/api/workspaces/${workspaceId}`,
        jsonRequest('PUT', layout),
        'Failed to save layout'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}
