import type { QueryClient } from '@tanstack/react-query'
import { requestJson } from '@/client/api/http'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { appUiKeys } from '@/client/api/app-ui-keys'
import {
  readSelectedSession,
  writeSelectedSession
} from '@/client/features/chat/sessions/browser-tab-state'
import { selectedSessionKey } from '@/client/features/chat/sessions/useSelectedSession'
import { moveChatDraft } from '@/client/features/chat/chat-send'
import { liveStore } from '@/client/features/chat/chat-store'
import { useUiStore } from '@/client/store/ui'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import { viewTabId } from '@/lib/workspace-tabs'
import type {
  PendingView,
  SelectedSessionScope,
  SessionInfo,
  ViewInfo,
  WorkspaceSessionSelection
} from '@/lib/types'

function pendingView(view: ViewInfo | undefined): PendingView | undefined {
  return view?.status === 'compiled' ? undefined : view
}

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
  const cachedView = pendingView(
    queryClient
      .getQueryData<ViewInfo[]>(workspaceKeys.views(workspaceId))
      ?.find(view => view.id === viewId)
  )
  let target = cachedView?.executionSessionId ?? sessionId
  try {
    const [{ views }, selection] = await Promise.all([
      requestJson<{ views: ViewInfo[] }>(`/api/workspaces/${workspaceId}/views`),
      requestJson<WorkspaceSessionSelection>(`/api/workspaces/${workspaceId}/selected-session`)
    ])
    const view = pendingView(views.find(view => view.id === viewId))
    if (!pinned && view?.status === 'draft') {
      target = draftSessionId(viewTabId(viewId))
      queryClient.setQueryData<SessionInfo[]>(workspaceKeys.sessions(workspaceId), sessions =>
        sessions?.filter(session => session.sessionId !== sessionId)
      )
      queryClient.removeQueries({ queryKey: workspaceKeys.events(workspaceId, sessionId) })
    } else {
      target =
        view?.executionSessionId ??
        (pinned ? selection.pinned : selection.selected[viewTabId(viewId)]) ??
        sessionId
    }
    moveChatDraft(workspaceId, sessionId, target)
    if (view?.status === 'draft' || view?.status === 'failed')
      liveStore.getState().setActivity(workspaceId, target, 'idle')
    queryClient.setQueryData(workspaceKeys.views(workspaceId), views)
    queryClient.setQueryData(appUiKeys.sessionSelection(workspaceId), selection)
    if (selectionScope === 'browser-tab' && !pinned) {
      const local =
        queryClient.getQueryData<WorkspaceSessionSelection>(
          selectedSessionKey(workspaceId, 'browser-tab')
        ) ?? readSelectedSession(workspaceId)
      const selected = { ...local.selected }
      if (view?.status === 'draft') delete selected[viewTabId(viewId)]
      else selected[viewTabId(viewId)] = target
      const next = { selected, pinned: null }
      queryClient.setQueryData(selectedSessionKey(workspaceId, 'browser-tab'), next)
      writeSelectedSession(workspaceId, next)
    }
  } catch {
    moveChatDraft(workspaceId, sessionId, target)
    // Offline: retain the draft at its current identity until state can refresh.
    void queryClient.invalidateQueries({ queryKey: workspaceKeys.views(workspaceId) })
    void queryClient.invalidateQueries({ queryKey: appUiKeys.sessionSelection(workspaceId) })
  }
  const draftKey = composerDraftKey(workspaceId, target)
  const ui = useUiStore.getState()
  ui.setComposerDraft(draftKey, ui.composerDrafts[draftKey] ?? text)
}
