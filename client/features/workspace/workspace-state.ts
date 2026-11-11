import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { toast } from '@/client/components/ui/toast'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import type { WorkspaceState } from '@/lib/types'

// Per-user chat state for one workspace: pin, the chat each tab shows, chat
// settings and fork history, and views being built. One cache, kept current by
// write replies and `state:changed` events instead of refetches.

export function workspaceStateKey(workspaceId: string) {
  return workspaceKeys.state(workspaceId)
}

// Writes that answer with the state share this key. While one is in flight,
// replies and events wait, so they never land over a newer optimistic change.
function writeKey(workspaceId: string) {
  return [...workspaceStateKey(workspaceId), 'write'] as const
}

function writesInFlight(queryClient: QueryClient, workspaceId: string): number {
  return queryClient.isMutating({ mutationKey: writeKey(workspaceId) })
}

// Keep the newer copy. A reply or event can arrive after a newer one.
function newer(current: WorkspaceState | undefined, next: WorkspaceState): WorkspaceState {
  return current && current.revision > next.revision ? current : next
}

export function workspaceStateOptions(queryClient: QueryClient, workspaceId: string) {
  const queryKey = workspaceStateKey(workspaceId)
  return {
    queryKey,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const next = await requestJson<WorkspaceState>(`/api/workspaces/${workspaceId}/state`, {
        signal
      })
      const current = queryClient.getQueryData<WorkspaceState>(queryKey)
      // A write in flight already shows its change; its reply brings the
      // server's copy.
      if (current && writesInFlight(queryClient, workspaceId) > 0) return current
      return newer(current, next)
    },
    // Events keep the cache current, so new observers never refetch. A focus
    // refetch heals anything missed while the socket was down.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: true
  }
}

export function useWorkspaceState<T = WorkspaceState>(
  workspaceId: string,
  select?: (state: WorkspaceState) => T
) {
  const queryClient = useQueryClient()
  return useQuery({ ...workspaceStateOptions(queryClient, workspaceId), select })
}

export function getCachedWorkspaceState(
  queryClient: QueryClient,
  workspaceId: string
): WorkspaceState | undefined {
  return queryClient.getQueryData<WorkspaceState>(workspaceStateKey(workspaceId))
}

// Apply a local change before the server confirms it.
export function changeWorkspaceStateCache(
  queryClient: QueryClient,
  workspaceId: string,
  change: (draft: WorkspaceState) => void
): void {
  queryClient.setQueryData<WorkspaceState>(workspaceStateKey(workspaceId), current => {
    if (!current) return current
    const draft = structuredClone(current)
    change(draft)
    return draft
  })
}

export function receiveWorkspaceState(
  queryClient: QueryClient,
  workspaceId: string,
  next: WorkspaceState
): void {
  queryClient.setQueryData<WorkspaceState>(workspaceStateKey(workspaceId), current =>
    newer(current, next)
  )
}

type WorkspaceStateWriteOptions<Input> = {
  request: (input: Input) => Promise<WorkspaceState>
  optimistic?: (draft: WorkspaceState, input: Input) => void
  onSuccess?: (state: WorkspaceState, input: Input) => void
  errorTitle: string
}

// A write that answers with the new state. Writes to one workspace run in
// order; the last reply becomes the cache, and a failure refetches it.
export function useWorkspaceStateWrite<Input>(
  workspaceId: string,
  { request, optimistic, onSuccess, errorTitle }: WorkspaceStateWriteOptions<Input>
) {
  const queryClient = useQueryClient()
  const queryKey = workspaceStateKey(workspaceId)
  return useMutation<WorkspaceState, Error, Input>({
    mutationKey: writeKey(workspaceId),
    scope: { id: `workspace-state:${workspaceId}` },
    mutationFn: request,
    onMutate: async input => {
      if (!optimistic) return
      await queryClient.cancelQueries({ queryKey, exact: true })
      changeWorkspaceStateCache(queryClient, workspaceId, draft => optimistic(draft, input))
    },
    onSuccess: (state, input) => {
      // This write still counts as in flight; a later one owns the cache.
      if (writesInFlight(queryClient, workspaceId) === 1)
        receiveWorkspaceState(queryClient, workspaceId, state)
      onSuccess?.(state, input)
    },
    onError: error => {
      toast.add({ title: errorTitle, description: error.message, type: 'error' })
      void queryClient.invalidateQueries({ queryKey, exact: true })
    }
  })
}

// Mounted once for the app: every browser tab hears every workspace's
// changes, so cached states stay current even while their workspace is closed.
export function useWorkspaceStateSync(): void {
  const queryClient = useQueryClient()
  useWorkspaceEvent(event => {
    if (event.type !== 'state:changed') return
    if (!getCachedWorkspaceState(queryClient, event.workspaceId)) return
    if (writesInFlight(queryClient, event.workspaceId) > 0) return
    receiveWorkspaceState(queryClient, event.workspaceId, event.state)
  })
}

// A harness replaced a temporary chat id with its real one. Mirrors the
// server's rename so the chat keeps its tab, settings, pin and build at once.
export function renameSessionInState(draft: WorkspaceState, from: string, to: string): void {
  if (from === to) return
  const source = draft.sessions[from]
  if (source) {
    const target = draft.sessions[to]
    const config =
      source.config || target?.config ? { ...source.config, ...target?.config } : undefined
    draft.sessions[to] = { ...source, ...target, ...(config ? { config } : {}) }
    delete draft.sessions[from]
  }
  for (const session of Object.values(draft.sessions))
    if (session.fork?.fromSessionId === from) session.fork.fromSessionId = to
  for (const [tabId, sessionId] of Object.entries(draft.selected))
    if (sessionId === from) draft.selected[tabId as keyof WorkspaceState['selected']] = to
  if (draft.pinnedSessionId === from) draft.pinnedSessionId = to
  for (const view of Object.values(draft.pendingViews))
    if (view.buildSessionId === from) view.buildSessionId = to
}

// An archived chat leaves every tab and the pin.
export function clearSessionInState(draft: WorkspaceState, sessionId: string): void {
  for (const [tabId, selected] of Object.entries(draft.selected))
    if (selected === sessionId) delete draft.selected[tabId as keyof WorkspaceState['selected']]
  if (draft.pinnedSessionId === sessionId) delete draft.pinnedSessionId
}
