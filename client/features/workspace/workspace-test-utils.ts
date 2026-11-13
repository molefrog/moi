import { queryClient as appQueryClient } from '@/client/api/query-client'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { QueryClient } from '@tanstack/react-query'
import { createDefaultWorkspaceLayout } from '@/lib/workspace-layout'
import { workspaceApiBase, type RemoteWorkspaceTarget } from '@/lib/workspace-config'
import type { WorkspaceLayoutResponse } from '@/lib/types'

// Seed the info response for tests that mount a consumer without the workspace loader.
export function seedWorkspaceInfo(
  id: string,
  remote?: RemoteWorkspaceTarget,
  client: QueryClient = appQueryClient
): WorkspaceLayoutResponse {
  const info: WorkspaceLayoutResponse = {
    ...createDefaultWorkspaceLayout(),
    name: id,
    cwd: `/workspaces/${id}`,
    apiBase: workspaceApiBase(remote?.workspace_id ?? id, remote?.user_id),
    isRemote: !!remote,
    remote
  }
  client.setQueryData(workspaceKeys.layout(id), info)
  return info
}
