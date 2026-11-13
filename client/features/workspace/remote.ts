import { queryClient as appQueryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { QueryClient } from '@tanstack/react-query'
import type { WorkspaceEntry, WorkspaceLayoutResponse } from '@/lib/types'
import { workspaceApiBase } from '@/lib/workspace-config'
import type { RemoteWorkspaceTarget } from '@/lib/workspace-config'

// Resolve owner identity from the local descriptor already loaded by the app.
export function remoteTarget(
  workspaceId: string,
  queryClient: QueryClient = appQueryClient
): RemoteWorkspaceTarget | undefined {
  return (
    queryClient.getQueryData<WorkspaceLayoutResponse>(workspaceKeys.descriptor(workspaceId))
      ?.remote ??
    queryClient.getQueryData<WorkspaceLayoutResponse>(workspaceKeys.layout(workspaceId))?.remote ??
    queryClient
      .getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
      ?.find(entry => entry.id === workspaceId)?.remote
  )
}

export function ownerApiBase(workspaceId: string): string {
  if (/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(workspaceId)) return `/api/workspaces/${workspaceId}`
  const known =
    appQueryClient.getQueryData(workspaceKeys.descriptor(workspaceId)) ??
    appQueryClient.getQueryData(workspaceKeys.layout(workspaceId)) ??
    appQueryClient
      .getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
      ?.find(entry => entry.id === workspaceId)
  if (!known) throw new Error('Workspace identity is not loaded')
  const remote = remoteTarget(workspaceId)
  return workspaceApiBase(remote?.workspace_id ?? workspaceId, remote?.user_id)
}
