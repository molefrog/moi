import { workspaceBase } from '@/lib/workspace-identity'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { readConnectors } from './read-connectors'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { McpServer } from '@/lib/types'

export function useWorkspaceMcp(workspaceId: string, enabled: boolean) {
  const queryClient = useQueryClient()
  return useQuery<McpServer[]>({
    queryKey: workspaceKeys.mcp(workspaceId),
    queryFn: async ({ signal }) =>
      readConnectors(
        await fetch(`${workspaceBase(workspaceId)}/mcp?stream=true`, { signal }),
        connectors => {
          if (!signal.aborted) queryClient.setQueryData(workspaceKeys.mcp(workspaceId), connectors)
        }
      ),
    retry: false,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false
  })
}
