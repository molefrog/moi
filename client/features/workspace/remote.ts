import { queryClient as appQueryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { QueryClient } from '@tanstack/react-query'
import { workspaceApiBase } from '@/lib/workspace-config'
import type { RemoteWorkspaceTarget } from '@/lib/workspace-config'

export type WorkspaceApiTarget = {
  apiBase: string
  isRemote: boolean
}

// The workspace loader resolves routing before mounting content. Non-React
// consumers (applet modules, presence, logs) read that same resolved target.
export function setWorkspaceApiTarget(
  localId: string,
  remote?: RemoteWorkspaceTarget,
  client: QueryClient = appQueryClient
): WorkspaceApiTarget {
  const apiBase = workspaceApiBase(remote?.workspace_id ?? localId, remote?.user_id)
  const isRemote = !!remote
  const previous = client.getQueryData<WorkspaceApiTarget>(workspaceKeys.apiTarget(localId))
  if (previous?.apiBase === apiBase && previous.isRemote === isRemote) return previous
  client.setQueryDefaults(workspaceKeys.apiTarget(localId), { gcTime: Infinity })
  const target = { apiBase, isRemote }
  client.setQueryData(workspaceKeys.apiTarget(localId), target)
  return target
}

export function isRemoteWorkspace(localId: string, client: QueryClient = appQueryClient) {
  return (
    client.getQueryData<WorkspaceApiTarget>(workspaceKeys.apiTarget(localId))?.isRemote ?? false
  )
}

export function ownerApiBase(localId: string, client: QueryClient = appQueryClient): string {
  const target = client.getQueryData<WorkspaceApiTarget>(workspaceKeys.apiTarget(localId))
  if (!target) throw new Error('Workspace identity is not loaded')
  return target.apiBase
}
