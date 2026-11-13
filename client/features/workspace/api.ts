import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { getWorkspaceApiBase, isRemoteWorkspace } from './remote'
import { toast } from '@/client/components/ui/toast'
import { receiveWorkspaceHarness } from './harness-transition'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { BROWSER_TAB_ID } from '@/client/lib/browser-tab-id'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import type {
  WorkspaceEntry,
  WorkspaceHarness,
  WorkspaceLayoutResponse,
  WorkspaceInfoResponse,
  WorkspaceLayoutSave,
  WorkspaceSkillsStatus,
  WorkspaceSkillsUpdateFailure,
  WorkspaceType
} from '@/lib/types'

export type { WorkspaceLayoutResponse } from '@/lib/types'

// One info query per API address, shared by discovery and the workspace loader.
export function workspaceInfoOptions(apiBase: string) {
  const address = decodeURIComponent(apiBase.slice('/api/workspaces/'.length))
  return {
    queryKey: workspaceKeys.layout(address),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      requestJson<WorkspaceInfoResponse>(apiBase, { signal }),
    staleTime: 60_000,
    retry: false
  }
}

export function useWorkspaceLayout(workspaceId: string) {
  const client = useQueryClient()
  const options = workspaceInfoOptions(`/api/workspaces/${workspaceId}`)
  return useQuery<WorkspaceLayoutResponse>({
    queryKey: options.queryKey,
    queryFn: async context => {
      const local = await options.queryFn(context)
      if (context.signal.aborted) throw context.signal.reason
      if (!local.isRemote) return local
      const owner = await client.fetchQuery(workspaceInfoOptions(local.apiBase))
      if (context.signal.aborted) throw context.signal.reason
      if (owner.isRemote) throw new Error('The owner address points to another remote reference')
      const {
        selectedModel: _model,
        selectedEffort: _effort,
        selectedSpeedMode: _speed,
        ...shared
      } = owner
      return {
        ...shared,
        layoutMode: 'fullscreen',
        tabs: createDefaultWorkspaceLayout().tabs,
        apiBase: local.apiBase,
        isRemote: local.isRemote,
        cwd: local.cwd
      }
    },
    ...WORKSPACE_RESOURCE_OPTIONS,
    retry: false
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
    // Remote chat support is deferred, so the visitor's agent is never consulted.
    enabled: !isRemoteWorkspace(workspaceId, queryClient),
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

export type WorkspaceLayoutMutation = WorkspaceLayoutSave & { saveShared?: boolean }

export function useSaveLayout(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, WorkspaceLayoutMutation>({
    mutationFn: async ({ saveShared, ...layout }) => {
      const remote = isRemoteWorkspace(workspaceId, queryClient)
      if (!remote)
        return requestVoid(
          `/api/workspaces/${workspaceId}`,
          jsonRequest('PUT', { ...layout, origin: BROWSER_TAB_ID })
        )
      if (!saveShared) return
      const {
        tabs: _tabs,
        layoutMode: _mode,
        selectedModel: _model,
        selectedEffort: _effort,
        selectedSpeedMode: _speed,
        // The harness is the owner's to choose; a stale visitor tab must not revert it.
        harness: _harness,
        ...shared
      } = layout
      await requestVoid(
        getWorkspaceApiBase(workspaceId, queryClient),
        jsonRequest('PUT', { ...shared, origin: BROWSER_TAB_ID })
      )
    },
    onError: error => {
      toast.add({ title: 'Couldn’t save workspace', description: error.message, type: 'error' })
      if (isRemoteWorkspace(workspaceId, queryClient))
        void queryClient.invalidateQueries({
          queryKey: workspaceInfoOptions(getWorkspaceApiBase(workspaceId, queryClient)).queryKey,
          refetchType: 'none'
        })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(workspaceId) })
    },
    onSuccess: (_, { saveShared }) => {
      if (saveShared && isRemoteWorkspace(workspaceId, queryClient))
        void queryClient.invalidateQueries({
          queryKey: workspaceInfoOptions(getWorkspaceApiBase(workspaceId, queryClient)).queryKey
        })
      void queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
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
