import { queryClient as appQueryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { QueryClient } from '@tanstack/react-query'
import { workspaceApiBase } from '@/lib/workspace-config'
import type { RemoteWorkspaceTarget } from '@/lib/workspace-config'

export type WorkspaceApiAddress = {
  localId: string
  apiBase: string
  remote?: RemoteWorkspaceTarget
}

// The workspace loader resolves routing before mounting content. Non-React
// consumers (applet modules, presence, logs) read that same resolved address.
export function setWorkspaceApiAddress(
  localId: string,
  remote?: RemoteWorkspaceTarget,
  client: QueryClient = appQueryClient
): WorkspaceApiAddress {
  const previous = client.getQueryData<WorkspaceApiAddress>(workspaceKeys.address(localId))
  if (
    previous &&
    previous.remote?.user_id === remote?.user_id &&
    previous.remote?.workspace_id === remote?.workspace_id
  )
    return previous
  client.setQueryDefaults(workspaceKeys.address(localId), { gcTime: Infinity })
  const address = {
    localId,
    apiBase: workspaceApiBase(remote?.workspace_id ?? localId, remote?.user_id),
    remote
  }
  client.setQueryData(workspaceKeys.address(localId), address)
  return address
}

export function remoteTarget(localId: string, client: QueryClient = appQueryClient) {
  return client.getQueryData<WorkspaceApiAddress>(workspaceKeys.address(localId))?.remote
}

export function ownerApiBase(localId: string, client: QueryClient = appQueryClient): string {
  const address = client.getQueryData<WorkspaceApiAddress>(workspaceKeys.address(localId))
  if (!address) throw new Error('Workspace identity is not loaded')
  return address.apiBase
}
