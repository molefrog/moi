import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type {
  HarnessAvailability,
  HarnessLoginFlow,
  ViewInfo,
  WidgetInfo,
  WorkspaceLayout,
  WorkspaceSkillsStatus,
  WorkspaceSkillsUpdateFailure,
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
    // Account tokens can expire while the workspace stays open. One active
    // workspace probe per minute keeps the composer state honest without
    // turning the provider CLI into a hot polling loop.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  })
}

export function startWorkspaceLogin(workspaceId: string): Promise<HarnessLoginFlow> {
  return requestJson(
    `/api/workspaces/${workspaceId}/auth/login`,
    { method: 'POST' },
    'Could not start sign-in'
  )
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
