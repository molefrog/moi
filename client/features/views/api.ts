import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { APP_ICON_IDS } from '@/client/lib/app-icon-registry'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { ViewBuilder } from '@/lib/types'

function upsertBuilder(builders: ViewBuilder[] | undefined, builder: ViewBuilder): ViewBuilder[] {
  const current = builders ?? []
  const index = current.findIndex(candidate => candidate.id === builder.id)
  if (index === -1) return [...current, builder]
  return current.map(candidate =>
    candidate.id === builder.id && candidate.updatedAt <= builder.updatedAt ? builder : candidate
  )
}

export function useViewBuilders(workspaceId: string) {
  const queryClient = useQueryClient()
  useWorkspaceEvent(event => {
    if (event.type === 'view-builder:updated' && event.workspaceId === workspaceId) {
      queryClient.setQueryData<ViewBuilder[]>(workspaceKeys.viewBuilders(workspaceId), current =>
        upsertBuilder(current, event.builder)
      )
    } else if (event.type === 'view-builder:deleted' && event.workspaceId === workspaceId) {
      queryClient.setQueryData<ViewBuilder[]>(workspaceKeys.viewBuilders(workspaceId), current =>
        (current ?? []).filter(builder => builder.id !== event.builderId)
      )
    }
  })

  return useQuery<ViewBuilder[]>({
    queryKey: workspaceKeys.viewBuilders(workspaceId),
    queryFn: async () => {
      const data = await requestJson<{ builders: ViewBuilder[] }>(
        `/api/workspaces/${workspaceId}/view-builders`
      )
      return data.builders
    },
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export function useCreateViewBuilder(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<ViewBuilder, Error>({
    mutationFn: () =>
      requestJson(
        `/api/workspaces/${workspaceId}/view-builders`,
        jsonRequest('POST'),
        'Failed to create view builder'
      ),
    onSuccess: builder => {
      queryClient.setQueryData<ViewBuilder[]>(workspaceKeys.viewBuilders(workspaceId), current =>
        upsertBuilder(current, builder)
      )
    }
  })
}

export function useSaveViewBuilder(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<ViewBuilder, Error, { builderId: string; requirements: string }>({
    mutationFn: ({ builderId, requirements }) =>
      requestJson(
        `/api/workspaces/${workspaceId}/view-builders/${builderId}`,
        jsonRequest('PATCH', { input: { requirements } }),
        'Failed to save view requirements'
      ),
    onSuccess: builder => {
      queryClient.setQueryData<ViewBuilder[]>(workspaceKeys.viewBuilders(workspaceId), current =>
        upsertBuilder(current, builder)
      )
    }
  })
}

export type SubmitViewBuilderInput = {
  builderId: string
  requirements: string
  optimisticId: string
  model?: string
  effort?: string
  stream?: boolean
}

export function useSubmitViewBuilder(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<ViewBuilder, Error, SubmitViewBuilderInput>({
    mutationFn: ({ builderId, requirements, ...options }) =>
      requestJson(
        `/api/workspaces/${workspaceId}/view-builders/${builderId}/submit`,
        jsonRequest('POST', {
          input: { requirements },
          availableIcons: APP_ICON_IDS,
          ...options
        }),
        'Failed to start view builder'
      ),
    onSuccess: builder => {
      queryClient.setQueryData<ViewBuilder[]>(workspaceKeys.viewBuilders(workspaceId), current =>
        upsertBuilder(current, builder)
      )
    }
  })
}

export function useDiscardViewBuilder(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: builderId =>
      requestVoid(
        `/api/workspaces/${workspaceId}/view-builders/${builderId}`,
        { method: 'DELETE' },
        'Failed to discard view builder'
      ),
    onSuccess: (_result, builderId) => {
      queryClient.setQueryData<ViewBuilder[]>(workspaceKeys.viewBuilders(workspaceId), current =>
        (current ?? []).filter(builder => builder.id !== builderId)
      )
    }
  })
}
