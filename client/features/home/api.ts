import { remoteFromIdentity, workspaceIdentity, workspaceBase } from '@/lib/workspace-identity'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { jsonRequest, requestJson, requestVoid } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import type { WorkspaceLayoutResponse } from '@/lib/types'
import { BROWSER_TAB_ID } from '@/client/lib/browser-tab-id'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspacePreview } from '@/lib/types'

// Registrations identify the visitor's folder; display metadata belongs to the owner.
export async function resolveWorkspaceNames(
  entries: WorkspaceEntry[],
  previous: WorkspaceEntry[] = []
): Promise<WorkspaceEntry[]> {
  return Promise.all(
    entries.map(async registration => {
      if (!registration.remote) return registration
      const entry = { ...registration, id: workspaceIdentity(registration) }
      try {
        const owner = await requestJson<WorkspaceLayoutResponse>(workspaceBase(entry.id))
        return {
          ...entry,
          name: owner.name,
          icon: owner.icon,
          theme: owner.theme,
          type: owner.provider ?? 'claude-code',
          agentId: owner.agentId
        }
      } catch {
        // Keep only metadata resolved for this same owner, never visitor presentation.
        const cached = previous.find(item => item.id === entry.id)
        return {
          ...entry,
          name: cached?.name ?? registration.remote.workspace_id,
          icon: cached?.icon,
          theme: cached?.theme,
          type: cached?.type,
          agentId: cached?.agentId
        }
      }
    })
  )
}

export function useWorkspaces() {
  const queryClient = useQueryClient()
  return useQuery<WorkspaceEntry[]>({
    queryKey: workspaceKeys.all,
    queryFn: async () =>
      resolveWorkspaceNames(
        await requestJson<WorkspaceEntry[]>('/api/workspaces'),
        queryClient.getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
      ),
    // Live events invalidate the list on every change. This only bounds how
    // long a missed event (socket down) can leave it wrong; route switches
    // within the window reuse the cache.
    staleTime: 5 * 60_000
  })
}

export async function loadWorkspacePreviews(): Promise<Record<string, WorkspacePreview>> {
  const previews = await requestJson<Record<string, WorkspacePreview>>('/api/workspaces/previews')
  await Promise.all(
    Object.keys(previews).map(async key => {
      const remote = remoteFromIdentity(key)
      if (!remote) return
      try {
        previews[key] = await requestJson<WorkspacePreview>(`${workspaceBase(key)}/home-preview`)
      } catch {
        previews[key] = { thumbnails: [] }
      }
    })
  )
  return previews
}

const workspacePreviewsOptions = queryOptions({
  queryKey: workspaceKeys.previews,
  queryFn: loadWorkspacePreviews,
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
      requestJson<WorkspaceEntry[]>(
        '/api/workspaces/order',
        jsonRequest('PUT', { ids, origin: BROWSER_TAB_ID }),
        'Failed to reorder spaces'
      ).then(entries =>
        resolveWorkspaceNames(
          entries,
          queryClient.getQueryData<WorkspaceEntry[]>(workspaceKeys.all)
        )
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
