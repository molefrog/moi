import { useQuery } from '@tanstack/react-query'

import { requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { McpServer } from '@/lib/types'

export function useWorkspaceMcp(workspaceId: string, enabled: boolean) {
  return useQuery<McpServer[]>({
    queryKey: workspaceKeys.mcp(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/mcp`),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function useUserMcp() {
  return useQuery<McpServer[]>({
    queryKey: workspaceKeys.userMcp,
    queryFn: () => requestJson('/api/mcp'),
    staleTime: 30_000,
    gcTime: Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: true
  })
}
