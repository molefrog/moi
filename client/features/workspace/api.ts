import { useEffect } from 'react'

import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  onWorkspaceEventsReconnect,
  useWorkspaceEvent
} from '@/client/runtime/use-workspace-events'
import type {
  WorkspaceAgent,
  WorkspaceLayout,
  WorkspaceLayoutSave,
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

// After a real socket drop the server may have restarted or credentials may
// have changed: refetch every agent snapshot that is on screen. Registered once
// per query client, not once per hook — half a dozen components read this
// query at a time, and one invalidation each would cancel and restart the same
// fetch that many times.
const reconnectRegistered = new WeakSet<QueryClient>()
function registerAgentReconnect(queryClient: QueryClient) {
  if (reconnectRegistered.has(queryClient)) return
  reconnectRegistered.add(queryClient)
  onWorkspaceEventsReconnect(() => {
    void queryClient.invalidateQueries(
      { queryKey: workspaceKeys.agentAll },
      { cancelRefetch: false }
    )
  })
}

// The workspace's agent backend in one snapshot: availability (runtime
// presence + auth), the model catalog, and capabilities.
// `harness:updated` events refresh availability;
// focus refetches pick up model changes after a CLI update.
export function useWorkspaceAgent(workspaceId: string) {
  const queryClient = useQueryClient()
  useEffect(() => registerAgentReconnect(queryClient), [queryClient])
  useWorkspaceEvent(event => {
    if (event.type === 'harness:updated' && event.workspaceId === workspaceId) {
      queryClient.setQueryData<WorkspaceAgent>(workspaceKeys.agent(workspaceId), prev =>
        prev ? { ...prev, availability: event.availability } : prev
      )
    }
    // Env can swap credentials; the server dropped its cache — refetch.
    if (event.type === 'env:updated' && event.workspaceId === workspaceId) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.agent(workspaceId) })
    }
  })
  return useQuery<WorkspaceAgent>({
    queryKey: workspaceKeys.agent(workspaceId),
    queryFn: async ({ signal }) => {
      const key = workspaceKeys.agent(workspaceId)
      const previous = queryClient.getQueryData<WorkspaceAgent>(key)
      // `refresh=true` makes the server re-probe the CLI (three child
      // processes, seconds) instead of answering from its 30s cache. Only
      // worth it when the last snapshot was a failure: the user may have
      // signed in or installed the agent since, and that is also the only
      // state with a "check again" button. A working agent is reconfirmed
      // from the cache.
      const refresh = previous !== undefined && previous.availability.status !== 'available'
      const result = await requestJson<WorkspaceAgent>(
        `/api/workspaces/${workspaceId}/agent${refresh ? '?refresh=true' : ''}`,
        { signal }
      )
      // A live auth event received during this request is newer than its snapshot.
      const current = queryClient.getQueryData<WorkspaceAgent>(key)
      return current && current !== previous
        ? { ...result, availability: current.availability }
        : result
    },
    staleTime: 30_000,
    // Reconfirm cached failures on entry; a recent successful check can be reused.
    refetchOnMount: query =>
      query.state.data?.availability.status === 'available' ? true : 'always',
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
        jsonRequest('PUT', layout),
        'Failed to save layout'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
    }
  })
}
