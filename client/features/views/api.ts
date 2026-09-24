import type { MessageAttachment, PendingView, ViewInfo } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'

export function useViews(workspaceId: string) {
  const queryClient = useQueryClient()
  useWorkspaceEvent(event => {
    if (
      (event.type === 'views:changed' || event.type === 'view:deleted') &&
      event.workspaceId === workspaceId
    ) {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.views(workspaceId) })
      if (event.type === 'view:deleted')
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions(workspaceId) })
    }
  })
  return useQuery<ViewInfo[]>({
    queryKey: workspaceKeys.views(workspaceId),
    queryFn: async () =>
      (await requestJson<{ views: ViewInfo[] }>(`/api/workspaces/${workspaceId}/views`)).views,
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}
function useViewMutation<T, Input>(workspaceId: string, mutationFn: (input: Input) => Promise<T>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.views(workspaceId) })
  })
}
export function useRenameView(workspaceId: string) {
  return useViewMutation(workspaceId, ({ viewId, title }: { viewId: string; title: string }) =>
    requestJson<ViewInfo>(
      `/api/workspaces/${workspaceId}/views/${encodeURIComponent(viewId)}`,
      jsonRequest('PATCH', { title }),
      'Couldn’t rename view'
    )
  )
}
export function useDeleteView(workspaceId: string) {
  return useViewMutation(workspaceId, (viewId: string) =>
    requestVoid(
      `/api/workspaces/${workspaceId}/views/${encodeURIComponent(viewId)}`,
      { method: 'DELETE' },
      'Couldn’t delete view'
    )
  )
}
export function useCreateView(workspaceId: string) {
  return useViewMutation(workspaceId, () =>
    requestJson<PendingView>(
      `/api/workspaces/${workspaceId}/views`,
      jsonRequest('POST'),
      'Couldn’t create view'
    )
  )
}
export function useSaveViewDraft(workspaceId: string) {
  return useViewMutation(
    workspaceId,
    ({ viewId, requirements }: { viewId: string; requirements: string }) =>
      requestJson<PendingView>(
        `/api/workspaces/${workspaceId}/views/${viewId}`,
        jsonRequest('PATCH', { requirements }),
        'Couldn’t save view requirements'
      )
  )
}
export type SubmitViewInput = {
  viewId: string
  requirements: string
  sessionId: string
  optimisticId: string
  attachments?: MessageAttachment[]
  model?: string
  effort?: string
  fastMode?: boolean
  stream?: boolean
}
export function useSubmitView(workspaceId: string) {
  return useViewMutation(workspaceId, ({ viewId, ...input }: SubmitViewInput) =>
    requestJson<{ viewId: string; sessionId: string }>(
      `/api/workspaces/${workspaceId}/views/${viewId}/submit`,
      jsonRequest('POST', input),
      'Couldn’t start view chat'
    )
  )
}
export const useDiscardView = useDeleteView
