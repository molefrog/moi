import { useCallback, useMemo } from 'react'
import { useParams } from 'wouter'
import { tabFromPath } from '@/lib/navigation'
import type { WorkspaceSessionSelection, WorkspaceTabId } from '@/lib/types'
import { composerDraftKey } from '@/lib/session-drafts'
import { useUiStore } from '@/client/store/ui'

import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { appUiKeys } from '@/client/api/app-ui-keys'
import { jsonRequest, requestJson } from '@/client/api/http'
import { toast } from '@/client/components/ui/toast'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { SelectedSessionState } from '@/lib/types'

type SaveSelectedSessionInput = {
  sessionId: string | null
  previousSessionId: string | null
  tabId: WorkspaceTabId
}

type SetSelectedSession = (sessionId: string | null) => void

type SelectedSessionResult = readonly [
  sessionId: string | null | undefined,
  setSessionId: SetSelectedSession
]

export type SelectedSessionSaveResult = 'applied' | 'conflict' | 'ignored'

function selectedSessionMutationKey(workspaceId: string) {
  return [...appUiKeys.sessionSelection(workspaceId), 'save'] as const
}

export function optimisticallySetSelectedSession(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string | null,
  tabId: WorkspaceTabId
): SaveSelectedSessionInput | null {
  const queryKey = appUiKeys.sessionSelection(workspaceId)
  const current = queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)
  const previousSessionId = current?.selected[tabId] ?? null
  if (current && previousSessionId === sessionId) return null

  const selected = { ...current?.selected }
  if (sessionId === null) delete selected[tabId]
  else selected[tabId] = sessionId
  queryClient.setQueryData<WorkspaceSessionSelection>(queryKey, {
    selected,
    pinned: current?.pinned ?? null
  })
  return { sessionId, previousSessionId, tabId }
}

export function settleSelectedSessionSave(
  queryClient: QueryClient,
  workspaceId: string,
  saved: SelectedSessionState,
  input: SaveSelectedSessionInput
): SelectedSessionSaveResult {
  const queryKey = appUiKeys.sessionSelection(workspaceId)
  const current = queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)

  const currentSessionId = current?.selected[input.tabId] ?? null
  if (saved.sessionId !== input.sessionId && currentSessionId !== saved.sessionId) {
    return 'conflict'
  }
  if (currentSessionId !== input.sessionId && currentSessionId !== input.previousSessionId) {
    return 'ignored'
  }

  const selected = { ...current?.selected }
  if (saved.sessionId === null) delete selected[input.tabId]
  else selected[input.tabId] = saved.sessionId
  queryClient.setQueryData<WorkspaceSessionSelection>(queryKey, {
    selected,
    pinned: current?.pinned ?? null
  })
  return 'applied'
}

export function applySelectedSessionEvent(
  queryClient: QueryClient,
  workspaceId: string,
  hasPendingSave: boolean
): void {
  if (hasPendingSave) return
  void queryClient.invalidateQueries({ queryKey: appUiKeys.sessionSelection(workspaceId) })
}

export function renameSelectedSessionInCache(
  queryClient: QueryClient,
  workspaceId: string,
  from: string,
  to: string
): void {
  useUiStore
    .getState()
    .moveComposerDraft(composerDraftKey(workspaceId, from), composerDraftKey(workspaceId, to))
  queryClient.setQueryData<WorkspaceSessionSelection>(
    appUiKeys.sessionSelection(workspaceId),
    current =>
      current
        ? {
            selected: Object.fromEntries(
              Object.entries(current.selected).map(([tabId, id]) => [tabId, id === from ? to : id])
            ),
            pinned: current.pinned === from ? to : current.pinned
          }
        : current
  )
}

export function useCurrentTabId(): WorkspaceTabId {
  return tabFromPath(useParams()['*'] ?? '') ?? 'overview'
}

export function useSelectedSession(explicitTabId?: WorkspaceTabId): SelectedSessionResult {
  const routeTabId = useCurrentTabId()
  const tabId = explicitTabId ?? routeTabId
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => appUiKeys.sessionSelection(workspaceId), [workspaceId])
  const mutationKey = useMemo(() => selectedSessionMutationKey(workspaceId), [workspaceId])
  const pendingSaves = useIsMutating({ mutationKey, exact: true })

  const query = useWorkspaceSessionSelection()

  const { mutate: saveSelectedSession } = useMutation<
    SelectedSessionState,
    Error,
    SaveSelectedSessionInput
  >({
    mutationKey,
    scope: { id: `selected-session:${workspaceId}` },
    mutationFn: input =>
      requestJson(
        `/api/workspaces/${workspaceId}/selected-session`,
        jsonRequest('PUT', input),
        'Couldn’t save selected chat'
      ),
    onSuccess: (saved, input) => {
      const result = settleSelectedSessionSave(queryClient, workspaceId, saved, input)
      if (result !== 'conflict') return

      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      queryClient.invalidateQueries({
        queryKey: appUiKeys.sessionSelection(workspaceId)
      })
    },
    onError: (_error, input) => {
      const queryKey = appUiKeys.sessionSelection(workspaceId)
      const current = queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)
      if ((current?.selected[input.tabId] ?? null) !== input.sessionId) return

      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      queryClient.invalidateQueries({ queryKey })
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey, exact: true }) === 1)
        void queryClient.invalidateQueries({ queryKey: appUiKeys.sessionSelection(workspaceId) })
    }
  })

  const setSelectedSessionId = useCallback<SetSelectedSession>(
    sessionId => {
      if (queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)?.pinned) return
      const input = optimisticallySetSelectedSession(queryClient, workspaceId, sessionId, tabId)
      if (input) saveSelectedSession(input)
    },
    [queryClient, queryKey, saveSelectedSession, workspaceId, tabId]
  )

  useWorkspaceEvent(event => {
    if (event.type !== 'selected-session:updated' || event.workspaceId !== workspaceId) return
    applySelectedSessionEvent(queryClient, workspaceId, pendingSaves > 0)
  })

  const selectedSessionId =
    query.data === undefined ? undefined : (query.data.pinned ?? query.data.selected[tabId] ?? null)
  return [selectedSessionId, setSelectedSessionId]
}

function useWorkspaceSessionSelection() {
  const workspaceId = useWorkspaceId()
  return useQuery<WorkspaceSessionSelection>({
    queryKey: appUiKeys.sessionSelection(workspaceId),
    queryFn: () => requestJson(`/api/workspaces/${workspaceId}/selected-session`),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  })
}

export function usePinnedSession() {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const { data } = useWorkspaceSessionSelection()
  const mutation = useMutation({
    scope: { id: `pinned-session:${workspaceId}` },
    mutationFn: (sessionId: string | null) =>
      requestJson<{ pinnedSessionId: string | null }>(
        `/api/workspaces/${workspaceId}/pinned-session`,
        jsonRequest('PUT', { sessionId })
      ),
    onMutate: sessionId => {
      const queryKey = appUiKeys.sessionSelection(workspaceId)
      const previousPinnedSessionId =
        queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)?.pinned ?? null
      queryClient.setQueryData<WorkspaceSessionSelection>(queryKey, current => ({
        selected: current?.selected ?? {},
        pinned: sessionId
      }))
      return previousPinnedSessionId
    },
    onError: (_error, sessionId, previousPinnedSessionId) => {
      queryClient.setQueryData<WorkspaceSessionSelection>(
        appUiKeys.sessionSelection(workspaceId),
        current =>
          current?.pinned === sessionId
            ? { ...current, pinned: previousPinnedSessionId ?? null }
            : current
      )
      toast.add({ title: 'Couldn’t pin chat', type: 'error' })
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: appUiKeys.sessionSelection(workspaceId) })
    }
  })
  return {
    pinnedSessionId: data?.pinned ?? null,
    pin: mutation.mutate
  }
}
