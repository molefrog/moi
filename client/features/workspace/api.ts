import { receiveWorkspaceHarness } from './harness-transition'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { BROWSER_TAB_ID } from '@/client/lib/browser-tab-id'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import type {
  WorkspaceHarness,
  WorkspaceEntry,
  WorkspaceLayoutResponse,
  WorkspaceLayoutSave,
  WorkspaceSkillsStatus,
  WorkspaceSkillsUpdateFailure,
  WorkspaceType
} from '@/lib/types'

export type { WorkspaceLayoutResponse } from '@/lib/types'

export function useWorkspaceLayout(workspaceId: string) {
  return useQuery<WorkspaceLayoutResponse>({
    queryKey: workspaceKeys.layout(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}`),
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

// Workspace models, capabilities, and readiness for credential overrides or gateways.
export function useWorkspaceHarness(workspaceId: string) {
  const queryClient = useQueryClient()
  useWorkspaceEvent(event => {
    if (event.type === 'harness:updated' && event.workspaceId === workspaceId) {
      void queryClient.cancelQueries({ queryKey: workspaceKeys.harness(workspaceId) })
      queryClient.setQueryData<WorkspaceHarness>(workspaceKeys.harness(workspaceId), prev =>
        prev ? { ...prev, availability: event.availability } : prev
      )
    }
    // Env can swap credentials; the server dropped its cache — refetch.
    if (event.type === 'env:updated' && event.workspaceId === workspaceId) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.harness(workspaceId) })
    }
  })
  return useQuery<WorkspaceHarness>({
    queryKey: workspaceKeys.harness(workspaceId),
    queryFn: async ({ signal }) => {
      const previous = queryClient.getQueryData<WorkspaceHarness>(
        workspaceKeys.harness(workspaceId)
      )
      const refresh = previous?.hasAuthOverrides && previous.availability.status !== 'available'
      return requestJson<WorkspaceHarness>(
        `/api/workspaces/${workspaceId}/harness${refresh ? '?refresh=true' : ''}`,
        { signal }
      )
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true
  })
}

export function useWorkspaceSkills(workspaceId: string) {
  return useQuery<WorkspaceSkillsStatus>({
    queryKey: workspaceKeys.skills(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/skills`),
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export type WorkspaceSkillUpdateError = Error & {
  status?: WorkspaceSkillsStatus
}

async function updateWorkspaceSkills(workspaceId: string): Promise<WorkspaceSkillsStatus> {
  const response = await fetch(`/api/workspaces/${workspaceId}/skills/update`, { method: 'POST' })
  const text = await response.text()
  let body: WorkspaceSkillsStatus | WorkspaceSkillsUpdateFailure | null = null
  try {
    body = JSON.parse(text) as WorkspaceSkillsStatus | WorkspaceSkillsUpdateFailure
  } catch {}

  if (!response.ok) {
    const message = body && 'error' in body ? body.error : text
    const error = new Error(message || 'Failed to update workspace skill')
    if (body?.skills) {
      ;(error as WorkspaceSkillUpdateError).status = {
        skills: body.skills,
        updateAvailable: body.updateAvailable
      }
    }
    throw error
  }
  if (!body) throw new Error('Invalid workspace skill update response')
  return body
}

export function useUpdateWorkspaceSkills(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceSkillsStatus, WorkspaceSkillUpdateError>({
    mutationFn: () => updateWorkspaceSkills(workspaceId),
    onSuccess: status => {
      queryClient.setQueryData(workspaceKeys.skills(workspaceId), status)
    },
    onError: error => {
      if (error.status) {
        queryClient.setQueryData(workspaceKeys.skills(workspaceId), error.status)
      }
    }
  })
}

export function useSaveLayout(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, WorkspaceLayoutSave>({
    mutationFn: layout =>
      requestVoid(
        `/api/workspaces/${workspaceId}`,
        jsonRequest('PUT', { ...layout, origin: BROWSER_TAB_ID }),
        'Failed to save layout'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.previews })
    }
  })
}

export function useChangeWorkspaceHarness(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (type: WorkspaceType) =>
      requestJson<WorkspaceEntry>(
        `/api/workspaces/${workspaceId}/harness`,
        jsonRequest('PATCH', { type })
      ),
    onSuccess: entry => {
      void receiveWorkspaceHarness(queryClient, workspaceId, entry.type ?? 'claude-code')
    }
  })
}
