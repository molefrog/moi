import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useParams } from 'wouter'

import { appUiKeys } from '@/client/api/app-ui-keys'
import { jsonRequest, requestJson } from '@/client/api/http'
import {
  readSelectedSession,
  writeSelectedSession,
  type BrowserTabSelection
} from '@/client/features/chat/sessions/browser-tab-state'
import { useCollabEnabled } from '@/client/features/collab'
import { useWorkspaceId } from '@/client/features/workspace/workspace-context'
import {
  changeWorkspaceStateCache,
  getCachedWorkspaceState,
  renameSessionInState,
  useWorkspaceState,
  useWorkspaceStateWrite
} from '@/client/features/workspace/workspace-state'
import { useUiStore } from '@/client/store/ui'
import { composerDraftKey } from '@/lib/session-drafts'
import type { SelectedSessionScope, WorkspaceState, WorkspaceTabId } from '@/lib/types'
import { isWorkspaceTabId } from '@/lib/workspace-tabs'

type SetSelectedSession = (sessionId: string | null) => void

type SelectedSessionResult = readonly [
  sessionId: string | null | undefined,
  setSessionId: SetSelectedSession,
  selectSessionForTab: (sessionId: string, tabId: WorkspaceTabId) => Promise<void>
]

// PUT shows `sessionId` in the tab (only while it still shows `ifMatch`, when
// given); DELETE clears the tab if it still shows `sessionId`.
type SelectionWrite = {
  sessionId: string
  tabId: WorkspaceTabId
  show: boolean
  ifMatch?: string | null
}

export function browserTabSelectionKey(workspaceId: string) {
  return appUiKeys.browserTabSelection(workspaceId)
}

// sessionStorage is the source; the query only lets React observe it. Dropped
// on unmount so the next visit reads storage again.
export function browserTabSelectionOptions(workspaceId: string) {
  return {
    queryKey: browserTabSelectionKey(workspaceId),
    queryFn: () => Promise.resolve(readSelectedSession(workspaceId)),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  }
}

// The chat a tab shows: the pin, then this browser tab's own choice (collab),
// then the workspace's. Undefined until the state has loaded.
export function selectedSessionForTab(
  state: WorkspaceState | undefined,
  tabId: WorkspaceTabId,
  local?: BrowserTabSelection
): string | null | undefined {
  if (!state) return undefined
  if (state.pinnedSessionId) return state.pinnedSessionId
  if (local && tabId in local.selected) return local.selected[tabId] ?? null
  return state.selected[tabId] ?? null
}

function cachedBrowserTabSelection(
  queryClient: QueryClient,
  workspaceId: string
): BrowserTabSelection {
  return (
    queryClient.getQueryData<BrowserTabSelection>(browserTabSelectionKey(workspaceId)) ??
    readSelectedSession(workspaceId)
  )
}

// For handlers outside render, which must see a change before React does.
export function cachedSelectedSession(
  queryClient: QueryClient,
  workspaceId: string,
  tabId: WorkspaceTabId,
  scope: SelectedSessionScope
): string | null | undefined {
  return selectedSessionForTab(
    getCachedWorkspaceState(queryClient, workspaceId),
    tabId,
    scope === 'browser-tab' ? cachedBrowserTabSelection(queryClient, workspaceId) : undefined
  )
}

function setBrowserTabSelection(
  queryClient: QueryClient,
  workspaceId: string,
  change: (selected: BrowserTabSelection['selected']) => void
): void {
  const selected = { ...cachedBrowserTabSelection(queryClient, workspaceId).selected }
  change(selected)
  queryClient.setQueryData<BrowserTabSelection>(browserTabSelectionKey(workspaceId), { selected })
  writeSelectedSession(workspaceId, { selected })
}

function applySelectionWrite(draft: WorkspaceState, input: SelectionWrite): void {
  if (input.show) draft.selected[input.tabId] = input.sessionId
  else if (draft.selected[input.tabId] === input.sessionId) delete draft.selected[input.tabId]
}

// The request that points `tabId` at `sessionId` (null: a new chat), or
// undefined when nothing needs saving. Collab saves locally right here.
function selectionChange(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string | null,
  tabId: WorkspaceTabId,
  scope: SelectedSessionScope
): SelectionWrite | undefined {
  if (scope === 'browser-tab') {
    const local = cachedBrowserTabSelection(queryClient, workspaceId)
    if (tabId in local.selected && (local.selected[tabId] ?? null) === sessionId) return
    setBrowserTabSelection(queryClient, workspaceId, selected => {
      selected[tabId] = sessionId
    })
    return
  }
  const current = getCachedWorkspaceState(queryClient, workspaceId)?.selected[tabId] ?? null
  if (current === sessionId) return
  if (sessionId === null) return current ? { sessionId: current, tabId, show: false } : undefined
  return { sessionId, tabId, show: true, ifMatch: current }
}

// Show a chat in a tab before the server confirms it, without a request: for
// flows whose own request makes the server select it (view submission).
export function setSelectedSessionInCache(
  queryClient: QueryClient,
  workspaceId: string,
  sessionId: string,
  tabId: WorkspaceTabId,
  scope: SelectedSessionScope
): void {
  if (scope === 'browser-tab')
    setBrowserTabSelection(queryClient, workspaceId, selected => {
      selected[tabId] = sessionId
    })
  else
    changeWorkspaceStateCache(queryClient, workspaceId, draft => {
      draft.selected[tabId] = sessionId
    })
}

// A harness replaced a temporary chat id with its real one.
export function renameSelectedSessionInCache(
  queryClient: QueryClient,
  workspaceId: string,
  from: string,
  to: string
): void {
  useUiStore
    .getState()
    .moveComposerDraft(composerDraftKey(workspaceId, from), composerDraftKey(workspaceId, to))
  changeWorkspaceStateCache(queryClient, workspaceId, draft =>
    renameSessionInState(draft, from, to)
  )
  setBrowserTabSelection(queryClient, workspaceId, selected => {
    for (const [tabId, sessionId] of Object.entries(selected) as [WorkspaceTabId, string | null][])
      if (sessionId === from) selected[tabId] = to
  })
}

export function useCurrentTabId(): WorkspaceTabId {
  const tab = useParams()['*']
  return isWorkspaceTabId(tab) ? tab : 'overview'
}

function useSelectionWrite(workspaceId: string) {
  return useWorkspaceStateWrite<SelectionWrite>(workspaceId, {
    request: ({ sessionId, tabId, show, ifMatch }) =>
      requestJson<WorkspaceState>(
        `/api/workspaces/${workspaceId}/sessions/${encodeURIComponent(sessionId)}/selection`,
        jsonRequest(show ? 'PUT' : 'DELETE', show ? { tabId, ifMatch } : { tabId }),
        'Couldn’t save selected chat'
      ),
    optimistic: applySelectionWrite,
    errorTitle: 'Couldn’t save selected chat'
  })
}

export function useSelectedSession(explicitTabId?: WorkspaceTabId): SelectedSessionResult {
  const routeTabId = useCurrentTabId()
  const tabId = explicitTabId ?? routeTabId
  const workspaceId = useWorkspaceId()
  const collabEnabled = useCollabEnabled()
  const scope: SelectedSessionScope = collabEnabled ? 'browser-tab' : 'shared'
  const queryClient = useQueryClient()
  const state = useWorkspaceState(workspaceId).data
  const local = useQuery({
    ...browserTabSelectionOptions(workspaceId),
    enabled: scope === 'browser-tab'
  }).data
  const { mutate: save, mutateAsync: saveAsync } = useSelectionWrite(workspaceId)

  const setSelectedSessionId = useCallback<SetSelectedSession>(
    sessionId => {
      // A pinned chat shows in every tab until it is unpinned.
      if (getCachedWorkspaceState(queryClient, workspaceId)?.pinnedSessionId) return
      const input = selectionChange(queryClient, workspaceId, sessionId, tabId, scope)
      if (input) save(input)
    },
    [queryClient, save, workspaceId, tabId, scope]
  )

  const selectSessionForTab = useCallback(
    async (sessionId: string, destination: WorkspaceTabId) => {
      const input = selectionChange(queryClient, workspaceId, sessionId, destination, scope)
      if (!input) return
      const saved = await saveAsync(input)
      if (saved.selected[destination] !== sessionId) throw new Error('Couldn’t save selected chat')
    },
    [queryClient, saveAsync, scope, workspaceId]
  )

  const selectedSessionId =
    scope === 'browser-tab' && local === undefined
      ? undefined
      : selectedSessionForTab(state, tabId, scope === 'browser-tab' ? local : undefined)
  return [selectedSessionId, setSelectedSessionId, selectSessionForTab]
}

export function usePinnedSession() {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const state = useWorkspaceState(workspaceId).data
  const { mutate, mutateAsync } = useWorkspaceStateWrite<{ sessionId: string; pinned: boolean }>(
    workspaceId,
    {
      request: ({ sessionId, pinned }) =>
        requestJson<WorkspaceState>(
          `/api/workspaces/${workspaceId}/sessions/${encodeURIComponent(sessionId)}/pin`,
          { method: pinned ? 'PUT' : 'DELETE' },
          pinned ? 'Couldn’t pin chat' : 'Couldn’t unpin chat'
        ),
      optimistic: (draft, { sessionId, pinned }) => {
        if (pinned) draft.pinnedSessionId = sessionId
        else if (draft.pinnedSessionId === sessionId) delete draft.pinnedSessionId
      },
      errorTitle: 'Couldn’t change the pinned chat'
    }
  )
  const pin = useCallback((sessionId: string) => mutate({ sessionId, pinned: true }), [mutate])
  const unpinAsync = useCallback(async () => {
    const pinned = getCachedWorkspaceState(queryClient, workspaceId)?.pinnedSessionId
    if (pinned) await mutateAsync({ sessionId: pinned, pinned: false })
  }, [mutateAsync, queryClient, workspaceId])
  const unpin = useCallback(() => void unpinAsync().catch(() => {}), [unpinAsync])
  return {
    pinnedSessionId: state?.pinnedSessionId,
    loaded: state !== undefined,
    pin,
    unpin,
    unpinAsync
  }
}
