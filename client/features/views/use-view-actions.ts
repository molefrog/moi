import { useUiStore } from '@/client/store/ui'
import { draftSessionId, composerDraftKey } from '@/lib/session-drafts'
import { useQueryClient } from '@tanstack/react-query'

import {
  prepareOptimisticSend,
  moveChatDraft,
  finishComposerSend,
  attachmentsForSend,
  resolveChatRunOptions,
  startOptimisticSession
} from '@/client/features/chat/chat-send'
import {
  renameSelectedSessionInCache,
  setSelectedSessionInCache,
  usePinnedSession
} from '@/client/features/chat/sessions/use-selected-session'
import {
  changeWorkspaceStateCache,
  getCachedWorkspaceState
} from '@/client/features/workspace/workspace-state'
import { useCollabEnabled } from '@/client/features/collab'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/workspace-layout-context'
import {
  useCreateView,
  useDiscardView,
  useSaveViewDraft,
  useSubmitView
} from '@/client/features/views/api'
import { recoverViewSubmission } from './view-submission'
import type { PendingView } from '@/lib/types'
import { viewTabId } from '@/lib/workspace-tabs'

export function useViewActions() {
  const queryClient = useQueryClient()
  const collabEnabled = useCollabEnabled()
  const selectionScope = collabEnabled ? 'browser-tab' : 'shared'
  const { workspaceId, layout } = useWorkspaceLayoutCtx()
  const { pinnedSessionId } = usePinnedSession()
  const modelData = useWorkspaceAgent(workspaceId).data
  const createMutation = useCreateView(workspaceId)
  const saveMutation = useSaveViewDraft(workspaceId)
  const submitMutation = useSubmitView(workspaceId)
  const discardMutation = useDiscardView(workspaceId)

  const create = () => createMutation.mutateAsync()

  const save = (viewId: string, requirements: string) =>
    saveMutation.mutateAsync({ viewId, requirements })

  const submit = async (pendingView: PendingView, requirements: string) => {
    const text = requirements.trim()
    const draftId = pinnedSessionId ?? draftSessionId(viewTabId(pendingView.id))
    const sessionId = pinnedSessionId ?? crypto.randomUUID()
    const attachments = attachmentsForSend(workspaceId, draftId)
    if (!text && attachments.length === 0) return

    if (!pinnedSessionId)
      startOptimisticSession({
        tabId: viewTabId(pendingView.id),
        queryClient,
        workspaceId,
        sessionId,
        text,
        filenames: attachments.map(attachment => attachment.label)
      })
    if (!pinnedSessionId) {
      moveChatDraft(workspaceId, draftId, sessionId)
      setSelectedSessionInCache(
        queryClient,
        workspaceId,
        sessionId,
        viewTabId(pendingView.id),
        selectionScope
      )
    }
    const prepared = prepareOptimisticSend(
      { queryClient, workspaceId, sessionId, text },
      attachments
    )

    const config = getCachedWorkspaceState(queryClient, workspaceId)?.sessions[sessionId]?.config
    const { model, effort, fastMode, stream } = resolveChatRunOptions(
      modelData,
      config?.model ?? layout.selectedModel,
      config?.effort ?? layout.selectedEffort,
      config?.fastMode ?? layout.selectedFastMode
    )

    changeWorkspaceStateCache(queryClient, workspaceId, draft => {
      const view = draft.pendingViews[pendingView.id]
      if (view?.status === 'draft')
        Object.assign(view, { status: 'starting', requirements: text, buildSessionId: sessionId })
    })

    try {
      const result = await submitMutation.mutateAsync({
        viewId: pendingView.id,
        sessionId,
        requirements: text,
        optimisticId: prepared.optimisticId,
        selectedSessionScope: selectionScope,
        ...(attachments.length > 0
          ? {
              attachments: prepared.attachments
            }
          : {}),
        model,
        effort,
        fastMode,
        stream
      })
      moveChatDraft(workspaceId, sessionId, result.sessionId)
      renameSelectedSessionInCache(queryClient, workspaceId, sessionId, result.sessionId)
      if (!pinnedSessionId)
        setSelectedSessionInCache(
          queryClient,
          workspaceId,
          result.sessionId,
          viewTabId(pendingView.id),
          selectionScope
        )
      finishComposerSend(workspaceId, attachments)
      const draftKey = composerDraftKey(workspaceId, result.sessionId)
      const ui = useUiStore.getState()
      if (ui.composerDrafts[draftKey]?.trim() === text) ui.setComposerDraft(draftKey, null)
    } catch (error) {
      await recoverViewSubmission(
        queryClient,
        workspaceId,
        pendingView.id,
        sessionId,
        text,
        !!pinnedSessionId,
        selectionScope
      )
      throw error
    }
  }

  const discard = (viewId: string) => discardMutation.mutateAsync(viewId)

  return {
    create,
    save,
    submit,
    discard
  }
}
