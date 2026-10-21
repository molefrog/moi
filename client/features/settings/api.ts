import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { WORKSPACE_RESOURCE_OPTIONS } from '@/client/api/query-options'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { WorkspaceLayoutResponse } from '@/client/features/workspace/api'
import { BROWSER_TAB_ID } from '@/client/lib/browser-tab-id'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import type { AppSettings, WorkspaceEntry, WorkspaceEnvView, WorkspaceIcon } from '@/lib/types'

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

type WorkspaceIconMutation =
  | { kind: 'set'; icon: WorkspaceIcon }
  | { kind: 'upload'; file: Blob }
  | { kind: 'reset' }

export function useUpdateWorkspaceIcon(workspaceId: string) {
  const queryClient = useQueryClient()
  const mutationKey = ['workspace-icon', workspaceId]
  return useMutation<void, Error, WorkspaceIconMutation>({
    mutationKey,
    scope: { id: `workspace-icon:${workspaceId}` },
    mutationFn: async update => {
      if (update.kind === 'set') {
        await requestVoid(
          `/api/workspaces/${workspaceId}/config`,
          jsonRequest('PUT', { icon: update.icon, origin: BROWSER_TAB_ID }),
          'Failed to save icon'
        )
        return
      }
      if (update.kind === 'reset') {
        await requestVoid(
          `/api/workspaces/${workspaceId}/icon`,
          { method: 'DELETE' },
          'Failed to reset icon'
        )
        return
      }
      await requestJson(`/api/workspaces/${workspaceId}/icon`, {
        method: 'PUT',
        headers: { 'Content-Type': update.file.type || 'application/octet-stream' },
        body: update.file
      })
    },
    onMutate: async update => {
      if (update.kind !== 'set') return
      // Exact on the list: a prefix cancel would abort every workspace query.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: workspaceKeys.layout(workspaceId) }),
        queryClient.cancelQueries({ queryKey: workspaceKeys.all, exact: true })
      ])
      const presentation = { icon: update.icon }
      queryClient.setQueryData<WorkspaceLayoutResponse>(
        workspaceKeys.layout(workspaceId),
        current => (current ? { ...current, ...presentation } : current)
      )
      queryClient.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, current =>
        current?.map(workspace =>
          workspace.id === workspaceId ? { ...workspace, ...presentation } : workspace
        )
      )
    },
    // Sync once the last queued change settles: refetching after an earlier
    // one would land its icon over a newer optimistic pick.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      queryClient.invalidateQueries({ queryKey: workspaceKeys.layout(workspaceId) })
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    }
  })
}

export function removeWorkspaceFromCache(
  workspaces: WorkspaceEntry[] | undefined,
  workspaceId: string
) {
  return (workspaces ?? []).filter(workspace => workspace.id !== workspaceId)
}
