import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { workspaceIconBlob, type WorkspaceIconUpdate } from '@/client/features/settings/render-icon'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { AppSettings, WorkspaceEntry, WorkspaceEnvView } from '@/lib/types'

// App-wide settings (server-side settings.json, GET/PATCH /api/settings) —
// shared by every workspace, unlike the per-workspace queries below.
export const appSettingsKey = ['app-settings'] as const

export function useAppSettings() {
  const queryClient = useQueryClient()
  // Another client can change settings; the server broadcasts the new value
  // over the live-events socket so every open client stays in sync.
  useWorkspaceEvent(event => {
    if (event.type === 'settings:updated') {
      queryClient.setQueryData<AppSettings>(appSettingsKey, event.settings)
    }
  })
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

export function useUpdateWorkspaceIcon(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, WorkspaceIconUpdate>({
    scope: { id: `workspace-icon:${workspaceId}` },
    mutationFn: async update => {
      const blob = await workspaceIconBlob(update)
      if (blob === null) {
        await requestVoid(
          `/api/workspaces/${workspaceId}/icon`,
          { method: 'DELETE' },
          'Failed to reset icon'
        )
        return
      }
      await requestJson(`/api/workspaces/${workspaceId}/icon`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
        body: blob
      })
    },
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
