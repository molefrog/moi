import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { AppSettings, WorkspaceEntry, WorkspaceEnvView } from '@/lib/types'

// App-wide settings (server-side settings.json, GET/PATCH /api/settings) —
// shared by every workspace, unlike the per-workspace queries below.
export const appSettingsKey = ['app-settings'] as const

export function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: appSettingsKey,
    queryFn: () => requestJson('/api/settings'),
    staleTime: 30_000
  })
}

export function useSaveAppSettings() {
  const queryClient = useQueryClient()
  return useMutation<AppSettings, Error, Partial<AppSettings>>({
    mutationFn: patch =>
      requestJson('/api/settings', jsonRequest('PATCH', patch), 'Failed to save settings'),
    onSuccess: next => {
      queryClient.setQueryData<AppSettings>(appSettingsKey, next)
    }
  })
}

export function useWorkspaceEnv(workspaceId: string) {
  return useQuery<WorkspaceEnvView>({
    queryKey: workspaceKeys.env(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/env`),
    ...WORKSPACE_RESOURCE_OPTIONS
  })
}

export type EnvPatch = {
  set?: Record<string, string>
  remove?: string[]
  inheritDotenv?: boolean
}

export function useUpdateEnv(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceEnvView, Error, EnvPatch>({
    mutationFn: patch =>
      requestJson(`/api/workspaces/${workspaceId}/env`, jsonRequest('PUT', patch)),
    onSuccess: next => {
      queryClient.setQueryData<WorkspaceEnvView>(workspaceKeys.env(workspaceId), next)
    }
  })
}

export function useSaveWorkspaceName(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string | null>({
    mutationFn: name =>
      requestVoid(
        `/api/workspaces/${workspaceId}/config`,
        jsonRequest('PUT', { name }),
        'Failed to save name'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
    }
  })
}

export function useSaveWorkspaceIcon(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<{ icon: string }, Error, Blob>({
    scope: { id: `workspace-icon:${workspaceId}` },
    mutationFn: blob =>
      requestJson(`/api/workspaces/${workspaceId}/icon`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
    }
  })
}

export function useResetWorkspaceIcon(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, void>({
    scope: { id: `workspace-icon:${workspaceId}` },
    mutationFn: () =>
      requestVoid(
        `/api/workspaces/${workspaceId}/icon`,
        { method: 'DELETE' },
        'Failed to reset icon'
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
    }
  })
}

export function removeWorkspaceFromCache(
  workspaces: WorkspaceEntry[] | undefined,
  workspaceId: string
) {
  return (workspaces ?? []).filter(workspace => workspace.id !== workspaceId)
}
