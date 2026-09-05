import { useEffect } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { onWorkspaceEventsReconnect, useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type {
  HarnessLogin,
  WorkspaceAgent,
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

// The workspace's agent backend in one snapshot: availability (runtime
// presence + auth), any in-flight login ceremony, the model catalog, and
// capabilities. Fetched once at workspace open; afterwards the volatile parts
// (`availability`, `login`) are patched in place by `agent:updated` events —
// the server owns the login watch loop, so the client never polls. Focus
// refetch stays as a cheap safety net (the server serves its cache).
export function useWorkspaceAgent(workspaceId: string) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onWorkspaceEventsReconnect(() => {
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.agent(workspaceId) })
      }),
    [queryClient, workspaceId]
  )
  useWorkspaceEvent(event => {
    if (event.type === 'agent:updated' && event.workspaceId === workspaceId) {
      queryClient.setQueryData<WorkspaceAgent>(workspaceKeys.agent(workspaceId), prev =>
        prev ? { ...prev, availability: event.availability, login: event.login } : prev
      )
    }
    // Env can swap credentials; the server dropped its cache — refetch.
    if (event.type === 'env:updated' && event.workspaceId === workspaceId) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.agent(workspaceId) })
    }
  })
  return useQuery<WorkspaceAgent>({
    queryKey: workspaceKeys.agent(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/agent`),
    staleTime: 30_000,
    refetchOnWindowFocus: true
  })
}

export function startWorkspaceLogin(workspaceId: string): Promise<HarnessLogin> {
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
