import { queryClient as appQueryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { QueryClient } from '@tanstack/react-query'
import type { WorkspaceEntry, WorkspaceLayoutResponse } from '@/lib/types'
import type { RemoteWorkspaceTarget } from '@/lib/workspace-config'

// The owner workspace a registration points at, read from the layout or list
// the app already holds. Only the few features that talk to the cloud or the
// owner directly (membership, presence) and the chat gate need this; every
// other request uses the same `/api/workspaces/:id` API as a local workspace.
export function remoteTarget(
  workspaceId: string,
  queryClient: QueryClient = appQueryClient
): RemoteWorkspaceTarget | undefined {
  return (
    queryClient.getQueryData<WorkspaceLayoutResponse>(workspaceKeys.layout(workspaceId))?.remote ??
    queryClient
      .getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
      ?.find(entry => entry.id === workspaceId)?.remote
  )
}
