import { useCollabEnabled } from '@/client/features/collab'
import {
  readSelectedSession,
  writeSelectedSession
} from '@/client/features/chat/sessions/browser-tab-state'
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
import type { SelectedSessionScope, SelectedSessionState } from '@/lib/types'

type SaveSelectedSessionInput = {
  sessionId: string | null
  previousSessionId: string | null
  tabId: WorkspaceTabId
  scope: SelectedSessionScope
}

type SetSelectedSession = (sessionId: string | null) => void

type SelectedSessionResult = readonly [
  sessionId: string | null | undefined,
  setSessionId: SetSelectedSession,
  selectSessionForTab: (sessionId: string, tabId: WorkspaceTabId) => Promise<void>
]

export type SelectedSessionSaveResult = 'applied' | 'conflict' | 'ignored'

export function selectedSessionKey(workspaceId: string, scope: SelectedSessionScope = 'shared') {
  const key = appUiKeys.sessionSelection(workspaceId)
  return scope === 'browser-tab' ? ([...key, 'browser-tab'] as const) : key
}

export function selectedSessionOptions(
  workspaceId: string,
  scope: SelectedSessionScope = 'shared'
) {
  return {
    queryKey: selectedSessionKey(workspaceId, scope),
    queryFn: () =>
      scope === 'browser-tab'
        ? Promise.resolve(readSelectedSession(workspaceId))
        : requestJson<WorkspaceSessionSelection>(`/api/workspaces/${workspaceId}/selected-session`),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  }
}

function selectedSessionMutationKey(workspaceId: string, scope: SelectedSessionScope) {
  return [...selectedSessionKey(workspaceId, scope), 'save'] as const
}

export function optimisticallySetSelectedSession(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string | null,
  tabId: WorkspaceTabId,
  scope: SelectedSessionScope = 'shared'
): SaveSelectedSessionInput | null {
  const queryKey = selectedSessionKey(workspaceId, scope)
  const current = queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)
  const previousSessionId = current?.selected[tabId] ?? null
  if (
    current &&
    previousSessionId === sessionId &&
    (scope === 'shared' || tabId in current.selected)
  )
    return null

  const selected = { ...current?.selected }
  if (sessionId === null && scope === 'shared') delete selected[tabId]
  else selected[tabId] = sessionId
  queryClient.setQueryData<WorkspaceSessionSelection>(queryKey, {
    selected,
    pinned: current?.pinned ?? null
  })
  if (scope === 'browser-tab') writeSelectedSession(workspaceId, { selected, pinned: null })
  return { sessionId, previousSessionId, tabId, scope }
}

export function settleSelectedSessionSave(
  queryClient: QueryClient,
  workspaceId: string,
  saved: SelectedSessionState,
  input: SaveSelectedSessionInput
): SelectedSessionSaveResult {
  const queryKey = selectedSessionKey(workspaceId, input.scope)
  const current = queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)

  const currentSessionId = current?.selected[input.tabId] ?? null
  if (saved.sessionId !== input.sessionId && currentSessionId !== saved.sessionId) {
    return 'conflict'
  }
  if (currentSessionId !== input.sessionId && currentSessionId !== input.previousSessionId) {
    return 'ignored'
  }

  const selected = { ...current?.selected }
  if (saved.sessionId === null && input.scope === 'shared') delete selected[input.tabId]
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
  void queryClient.invalidateQueries({
    queryKey: appUiKeys.sessionSelection(workspaceId),
    exact: true
  })
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
  for (const scope of ['shared', 'browser-tab'] as const) {
    queryClient.setQueryData<WorkspaceSessionSelection>(
      selectedSessionKey(workspaceId, scope),
      current =>
        current
          ? {
              selected: Object.fromEntries(
                Object.entries(current.selected).map(([tabId, id]) => [
                  tabId,
                  id === from ? to : id
                ])
              ),
              pinned: current.pinned === from ? to : current.pinned
            }
          : current
    )
  }
  const local = readSelectedSession(workspaceId)
  writeSelectedSession(workspaceId, {
    selected: Object.fromEntries(
      Object.entries(local.selected).map(([tabId, id]) => [tabId, id === from ? to : id])
    ),
    pinned: null
  })
}

export function useCurrentTabId(): WorkspaceTabId {
  return tabFromPath(useParams()['*'] ?? '') ?? 'overview'
}

export function selectedSessionForTab(
  shared: WorkspaceSessionSelection | undefined,
  tabId: WorkspaceTabId,
  local?: WorkspaceSessionSelection
): string | null | undefined {
  if (!shared) return undefined
  if (shared.pinned) return shared.pinned
  if (local && tabId in local.selected) return local.selected[tabId] ?? null
  return shared.selected[tabId] ?? null
}

export function useSelectedSession(explicitTabId?: WorkspaceTabId): SelectedSessionResult {
  const routeTabId = useCurrentTabId()
  const tabId = explicitTabId ?? routeTabId
  const workspaceId = useWorkspaceId()
  const collabEnabled = useCollabEnabled()
  const scope: SelectedSessionScope = collabEnabled ? 'browser-tab' : 'shared'
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => selectedSessionKey(workspaceId, scope), [workspaceId, scope])
  const mutationKey = useMemo(
    () => selectedSessionMutationKey(workspaceId, scope),
    [workspaceId, scope]
  )
  const pendingSaves = useIsMutating({ mutationKey, exact: true })

  // WorkspaceContent remains an observer for the active workspace. Nested hook
  // users reuse its result without refetching; once the route unmounts, dropping
  // the cache makes the next visit load the server-owned selection again.
  const query = useQuery(selectedSessionOptions(workspaceId, scope))
  // A pin is shared with CLI creation and applies to every workspace tab.
  const sharedSelection = useWorkspaceSessionSelection().data

  const { mutate: saveSelectedSession, mutateAsync: saveSelectedSessionAsync } = useMutation<
    SelectedSessionState,
    Error,
    SaveSelectedSessionInput
  >({
    mutationKey,
    scope: { id: `selected-session:${workspaceId}` },
    mutationFn: input => {
      if (input.scope === 'browser-tab') {
        writeSelectedSession(
          workspaceId,
          queryClient.getQueryData<WorkspaceSessionSelection>(queryKey) ??
            readSelectedSession(workspaceId)
        )
        return Promise.resolve({ sessionId: input.sessionId })
      }
      return requestJson<SelectedSessionState>(
        `/api/workspaces/${workspaceId}/selected-session`,
        jsonRequest('PUT', input),
        'Couldn’t save selected chat'
      )
    },
    onSuccess: (saved, input) => {
      const result = settleSelectedSessionSave(queryClient, workspaceId, saved, input)
      if (result !== 'conflict') return

      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      void queryClient.invalidateQueries({ queryKey, exact: true })
    },
    onError: (_error, input) => {
      const current = queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)
      if ((current?.selected[input.tabId] ?? null) !== input.sessionId) return

      toast.add({ title: 'Couldn’t save selected chat', type: 'error' })
      void queryClient.invalidateQueries({ queryKey, exact: true })
    },
    onSettled: () => {
      if (scope === 'shared' && queryClient.isMutating({ mutationKey, exact: true }) === 1)
        void queryClient.invalidateQueries({ queryKey, exact: true })
    }
  })

  const setSelectedSessionId = useCallback<SetSelectedSession>(
    sessionId => {
      if (
        queryClient.getQueryData<WorkspaceSessionSelection>(selectedSessionKey(workspaceId))?.pinned
      )
        return
      const input = optimisticallySetSelectedSession(
        queryClient,
        workspaceId,
        sessionId,
        tabId,
        scope
      )
      if (input) saveSelectedSession(input)
    },
    [queryClient, saveSelectedSession, workspaceId, tabId, scope]
  )

  const selectSessionForTab = useCallback(
    async (sessionId: string, destination: WorkspaceTabId) => {
      const input = optimisticallySetSelectedSession(
        queryClient,
        workspaceId,
        sessionId,
        destination,
        scope
      )
      if (!input) return
      const saved = await saveSelectedSessionAsync(input)
      if (
        saved.sessionId !== sessionId ||
        queryClient.getQueryData<WorkspaceSessionSelection>(queryKey)?.selected[destination] !==
          sessionId
      )
        throw new Error('Couldn’t save selected chat')
    },
    [queryClient, queryKey, saveSelectedSessionAsync, scope, workspaceId]
  )

  useWorkspaceEvent(event => {
    if (event.type !== 'selected-session:updated' || event.workspaceId !== workspaceId) return
    applySelectedSessionEvent(queryClient, workspaceId, scope === 'shared' && pendingSaves > 0)
  })

  const selectedSessionId =
    query.data === undefined || sharedSelection === undefined
      ? undefined
      : selectedSessionForTab(
          sharedSelection,
          tabId,
          scope === 'browser-tab' ? query.data : undefined
        )
  return [selectedSessionId, setSelectedSessionId, selectSessionForTab]
}

function useWorkspaceSessionSelection() {
  const workspaceId = useWorkspaceId()
  return useQuery(selectedSessionOptions(workspaceId))
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
      void queryClient.invalidateQueries({
        queryKey: appUiKeys.sessionSelection(workspaceId),
        exact: true
      })
    }
  })
  return {
    pinnedSessionId: data?.pinned ?? null,
    loaded: data !== undefined,
    pin: mutation.mutate,
    pinAsync: mutation.mutateAsync
  }
}
