import { workspaceApiBase, type RemoteWorkspaceTarget } from '@/lib/workspace-config'
import { workspaceInfoOptions } from '../workspace/api'
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueries,
  useQueryClient
} from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { BROWSER_TAB_ID } from '@/client/lib/browser-tab-id'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspacePreview } from '@/lib/types'

export function useWorkspaces() {
  return useQuery<WorkspaceEntry[]>({
    queryKey: workspaceKeys.all,
    queryFn: () => requestJson<WorkspaceEntry[]>('/api/workspaces'),
    // Live events invalidate the list on every change. This only bounds how
    // long a missed event (socket down) can leave it wrong; route switches
    // within the window reuse the cache.
    staleTime: 5 * 60_000
  })
}

// Enrich a deduplicated list independently: local cards and healthy owners never
// wait for a slow owner. Home and sidebar share the same metadata requests.
export function useWorkspaceMetadata<T extends { remote?: RemoteWorkspaceTarget }>(
  entries: T[]
): T[] {
  const addresses = [
    ...new Set(
      entries.flatMap(entry =>
        entry.remote ? [workspaceApiBase(entry.remote.workspace_id, entry.remote.user_id)] : []
      )
    )
  ]
  const queries = useQueries({ queries: addresses.map(workspaceInfoOptions) })
  const byAddress = new Map(addresses.map((address, i) => [address, queries[i]?.data]))
  return entries.map(entry => {
    const info =
      entry.remote &&
      byAddress.get(workspaceApiBase(entry.remote.workspace_id, entry.remote.user_id))
    if (!info || info.isRemote) return entry
    return {
      ...entry,
      ...(info.name && { name: info.name }),
      icon: info.icon,
      theme: info.theme,
      type: info.provider,
      agentId: info.agentId
    }
  })
}

const workspacePreviewsOptions = queryOptions({
  queryKey: workspaceKeys.previews,
  queryFn: () => requestJson<Record<string, WorkspacePreview>>('/api/workspaces/previews'),
  staleTime: 60_000
})

// Every card's preview in one request. The home page starts it beside the
// workspace list so it doesn't wait for the cards to mount.
export function useWorkspacePreviews() {
  return useQuery(workspacePreviewsOptions)
}

export function useWorkspacePreview(workspaceId: string) {
  return useQuery({ ...workspacePreviewsOptions, select: previews => previews[workspaceId] })
}

export function useDiscoveredWorkspaces() {
  return useQuery<DiscoveredWorkspace[]>({
    queryKey: workspaceKeys.discover,
    queryFn: () => requestJson('/api/workspaces/discover')
  })
}

const REORDER_KEY = ['workspaces-reorder']

export function useReorderWorkspaces() {
  const queryClient = useQueryClient()
  return useMutation<WorkspaceEntry[], Error, string[], { previous?: WorkspaceEntry[] }>({
    mutationKey: REORDER_KEY,
    mutationFn: ids =>
      requestJson(
        '/api/workspaces/order',
        jsonRequest('PUT', { ids, origin: BROWSER_TAB_ID }),
        'Failed to reorder spaces'
      ),
    onMutate: async ids => {
      // Exact: only pause the workspace list itself — a prefix cancel would
      // abort unrelated in-flight fetches (transcripts, widgets) that never
      // retry on their own.
      await queryClient.cancelQueries({ queryKey: workspaceKeys.all, exact: true })
      const previous = queryClient.getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
      if (previous) {
        const byId = new Map(previous.map(entry => [entry.id, entry]))
        const ordered = ids
          .map(id => byId.get(id))
          .filter((entry): entry is WorkspaceEntry => Boolean(entry))
        if (ordered.length === previous.length) {
          queryClient.setQueryData(workspaceKeys.all, ordered)
        }
      }
      return { previous }
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(workspaceKeys.all, context.previous)
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all, exact: true })
    },
    onSuccess: entries => {
      // An earlier drag's response must not land over a newer optimistic order.
      if (queryClient.isMutating({ mutationKey: REORDER_KEY }) > 1) return
      queryClient.setQueryData(workspaceKeys.all, entries)
    }
  })
}

export function useRemoveWorkspace() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: workspaceId =>
      requestVoid(
        `/api/workspaces/${workspaceId}`,
        { method: 'DELETE' },
        'Failed to remove workspace'
      ),
    onSuccess: (_result, workspaceId) => {
      queryClient.setQueryData<WorkspaceEntry[]>(workspaceKeys.all, previous =>
        (previous ?? []).filter(workspace => workspace.id !== workspaceId)
      )
      queryClient.invalidateQueries({ queryKey: workspaceKeys.discover })
    }
  })
}
