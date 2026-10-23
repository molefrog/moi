import type {
  CompiledView,
  MessageAttachment,
  PendingView,
  SelectedSessionScope,
  ViewInfo,
  WorkspaceState
} from '@/lib/types'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  getCachedWorkspaceState,
  useWorkspaceState
} from '@/client/features/workspace/workspace-state'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'

// Compiled views from `.moi/views/`. Build and layout events refetch the list;
// mounts within 30 s reuse it.
export function compiledViewsOptions(workspaceId: string) {
  return {
    queryKey: workspaceKeys.views(workspaceId),
    queryFn: async () =>
      (await requestJson<{ views: CompiledView[] }>(`/api/workspaces/${workspaceId}/views`)).views,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  }
}

// Compiled views first, then the views still being built (from the workspace
// state), in creation order. A view that just compiled shows once.
export function mergeViews(
  compiled: CompiledView[] | undefined,
  pending: WorkspaceState['pendingViews'] | undefined
): ViewInfo[] | undefined {
  if (!compiled || !pending) return undefined
  const ids = new Set(compiled.map(view => view.id))
  const building = Object.entries(pending)
    .filter(([id]) => !ids.has(id))
    .map(([id, view]): PendingView => ({ id, ...view }))
  return [...compiled, ...building]
}

export function getCachedViews(
  queryClient: QueryClient,
  workspaceId: string
): ViewInfo[] | undefined {
  return mergeViews(
    queryClient.getQueryData<CompiledView[]>(workspaceKeys.views(workspaceId)),
    getCachedWorkspaceState(queryClient, workspaceId)?.pendingViews
  )
}

const selectPendingViews = (state: WorkspaceState) => state.pendingViews

export function useViews(workspaceId: string) {
  const queryClient = useQueryClient()
  useWorkspaceEvent(event => {
    if (event.type === 'view:deleted' && event.workspaceId === workspaceId) {
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.views(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.sessions(workspaceId) })
    }
  })
  const compiled = useQuery(compiledViewsOptions(workspaceId))
  const pending = useWorkspaceState(workspaceId, selectPendingViews)
  const data = useMemo(() => mergeViews(compiled.data, pending.data), [compiled.data, pending.data])
  return { data, isLoading: compiled.isLoading || pending.isLoading }
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
  selectedSessionScope?: SelectedSessionScope
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
