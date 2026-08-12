import { useQueryClient } from '@tanstack/react-query'

import {
  attachmentPartsForOptimisticTurn,
  attachmentsForSend,
  resolveChatRunOptions,
  startOptimisticSession,
  startOptimisticTurn
} from '@/client/features/chat/chat-send'
import { liveStore } from '@/client/features/chat/chat-store'
import { useSelectedSession } from '@/client/features/chat/useSelectedSession'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import {
  useCreateViewBuilder,
  useDiscardViewBuilder,
  useSaveViewBuilder,
  useSubmitViewBuilder
} from '@/client/features/views/api'
import type { ViewBuilder } from '@/lib/types'

export function useViewBuilderActions() {
  const queryClient = useQueryClient()
  const { workspaceId, layout } = useWorkspaceLayoutCtx()
  const [, selectSession] = useSelectedSession()
  const modelData = useWorkspaceAgent(workspaceId).data
  const createMutation = useCreateViewBuilder(workspaceId)
  const saveMutation = useSaveViewBuilder(workspaceId)
  const submitMutation = useSubmitViewBuilder(workspaceId)
  const discardMutation = useDiscardViewBuilder(workspaceId)

  const create = () => createMutation.mutateAsync()

  const save = (builderId: string, requirements: string) =>
    saveMutation.mutateAsync({ builderId, requirements })

  const submit = async (builder: ViewBuilder, requirements: string) => {
    const text = requirements.trim()
    const attachments = attachmentsForSend(workspaceId, builder.sessionId)
    if (!text && attachments.length === 0) return

    startOptimisticSession({
      queryClient,
      workspaceId,
      sessionId: builder.sessionId,
      text,
      filenames: attachments.map(attachment => attachment.name)
    })
    const parts = attachmentPartsForOptimisticTurn(attachments)
    if (text) parts.push({ type: 'text', text })

    const optimisticId = startOptimisticTurn({
      queryClient,
      workspaceId,
      sessionId: builder.sessionId,
      parts
    })
    selectSession(builder.sessionId)

    const { model, effort, fastMode, stream } = resolveChatRunOptions(
      modelData,
      layout.selectedModel,
      layout.selectedEffort,
      layout.selectedFastMode
    )

    try {
      await submitMutation.mutateAsync({
        builderId: builder.id,
        requirements: text,
        optimisticId,
        ...(attachments.length > 0
          ? { attachments: attachments.map(attachment => attachment.upload!.id) }
          : {}),
        model,
        effort,
        fastMode,
        stream
      })
      liveStore.getState().clearAttachments(workspaceId, builder.sessionId)
    } catch (error) {
      liveStore.getState().setActivity(workspaceId, builder.sessionId, 'idle')
      liveStore
        .getState()
        .setError(
          workspaceId,
          builder.sessionId,
          error instanceof Error ? error.message : 'Could not start view builder'
        )
      throw error
    }
  }

  const discard = (builderId: string) => discardMutation.mutateAsync(builderId)

  return { create, save, submit, discard }
}
