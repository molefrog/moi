import type { QueryClient } from '@tanstack/react-query'
import { requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  readSelectedSession,
  writeSelectedSession,
  type BrowserTabSelection
} from '@/client/features/chat/sessions/browser-tab-state'
import { browserTabSelectionKey } from '@/client/features/chat/sessions/use-selected-session'
import { moveChatDraft } from '@/client/features/chat/chat-send'
import { liveStore } from '@/client/features/chat/chat-store'
import {
  getCachedWorkspaceState,
  receiveWorkspaceState
} from '@/client/features/workspace/workspace-state'
import { useUiStore } from '@/client/store/ui'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import { viewTabId } from '@/lib/workspace-tabs'
import type { SelectedSessionScope, SessionSummary, WorkspaceState } from '@/lib/types'

// A failed HTTP response does not prove startup failed. Refresh the server's
// state before restoring the fresh composer; never replay the request.
export async function recoverViewSubmission(
  queryClient: QueryClient,
  workspaceId: string,
  viewId: string,
  sessionId: string,
  text: string,
  pinned: boolean,
  selectionScope: SelectedSessionScope = 'shared'
) {
  const tabId = viewTabId(viewId)
  let target =
    getCachedWorkspaceState(queryClient, workspaceId)?.pendingViews[viewId]?.buildSessionId ??
    sessionId
  try {
    const state = await requestJson<WorkspaceState>(`/api/workspaces/${workspaceId}/state`)
    const view = state.pendingViews[viewId]
    if (!pinned && view?.status === 'draft') {
      target = draftSessionId(tabId)
      queryClient.setQueryData<SessionSummary[]>(workspaceKeys.sessions(workspaceId), sessions =>
        sessions?.filter(session => session.sessionId !== sessionId)
      )
      queryClient.removeQueries({ queryKey: workspaceKeys.events(workspaceId, sessionId) })
    } else {
      target =
        view?.buildSessionId ??
        (pinned ? state.pinnedSessionId : state.selected[tabId]) ??
        sessionId
    }
    moveChatDraft(workspaceId, sessionId, target)
    if (view?.status === 'draft' || view?.status === 'failed')
      liveStore.getState().setActivity(workspaceId, target, 'idle')
    receiveWorkspaceState(queryClient, workspaceId, state)
    if (selectionScope === 'browser-tab' && !pinned) {
      const local =
        queryClient.getQueryData<BrowserTabSelection>(browserTabSelectionKey(workspaceId)) ??
        readSelectedSession(workspaceId)
      const selected = { ...local.selected }
      if (view?.status === 'draft') delete selected[tabId]
      else selected[tabId] = target
      queryClient.setQueryData<BrowserTabSelection>(browserTabSelectionKey(workspaceId), {
        selected
      })
      writeSelectedSession(workspaceId, { selected })
    }
  } catch {
    moveChatDraft(workspaceId, sessionId, target)
    // Offline: retain the draft at its current identity until state can refresh.
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.state(workspaceId) })
  }
  const draftKey = composerDraftKey(workspaceId, target)
  const ui = useUiStore.getState()
  ui.setComposerDraft(draftKey, ui.composerDrafts[draftKey] ?? text)
}
