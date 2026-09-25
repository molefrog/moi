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
  optimisticallySetSelectedSession,
  renameSelectedSessionInCache,
  usePinnedSession
} from '@/client/features/chat/sessions/useSelectedSession'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import {
  useCreateView,
  useDiscardView,
  useSaveViewDraft,
  useSubmitView
} from '@/client/features/views/api'
import { recoverViewSubmission } from './view-submission'
import type { PendingView, SessionRecord, ViewInfo } from '@/lib/types'
import { viewTabId } from '@/lib/workspace-tabs'

export function useViewActions() {
  const queryClient = useQueryClient()
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
      optimisticallySetSelectedSession(
        queryClient,
        workspaceId,
        sessionId,
        viewTabId(pendingView.id)
      )
    }
    const prepared = prepareOptimisticSend(
      { queryClient, workspaceId, sessionId, text },
      attachments
    )

    const config = queryClient.getQueryData<SessionRecord>(
      workspaceKeys.session(workspaceId, sessionId)
    )?.config
    const { model, effort, fastMode, stream } = resolveChatRunOptions(
      modelData,
      config?.model ?? layout.selectedModel,
      config?.effort ?? layout.selectedEffort,
      config?.fastMode ?? layout.selectedFastMode
    )

    queryClient.setQueryData<ViewInfo[]>(workspaceKeys.views(workspaceId), views =>
      views?.map(view =>
        view.id === pendingView.id && view.status === 'draft'
          ? { ...view, status: 'starting', requirements: text, executionSessionId: sessionId }
          : view
      )
    )

    try {
      const result = await submitMutation.mutateAsync({
        viewId: pendingView.id,
        sessionId,
        requirements: text,
        optimisticId: prepared.optimisticId,
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
        optimisticallySetSelectedSession(
          queryClient,
          workspaceId,
          result.sessionId,
          viewTabId(pendingView.id)
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
        !!pinnedSessionId
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
