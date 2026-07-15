import { useQueryClient } from '@tanstack/react-query'

import { useWorkspaceModels } from '@/client/features/chat/api'
import { resolveChatRunOptions, startOptimisticTurn } from '@/client/features/chat/chat-send'
import { liveStore } from '@/client/features/chat/chat-store'
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
  const modelData = useWorkspaceModels(workspaceId).data
  const createMutation = useCreateViewBuilder(workspaceId)
  const saveMutation = useSaveViewBuilder(workspaceId)
  const submitMutation = useSubmitViewBuilder(workspaceId)
  const discardMutation = useDiscardViewBuilder(workspaceId)

  const create = () => createMutation.mutateAsync()

  const save = (builderId: string, requirements: string) =>
    saveMutation.mutateAsync({ builderId, requirements })

  const submit = async (builder: ViewBuilder, requirements: string) => {
    const text = requirements.trim()
    if (!text) return

    const optimisticId = startOptimisticTurn({
      queryClient,
      workspaceId,
      sessionId: builder.sessionId,
      parts: [{ type: 'text', text }]
    })
    liveStore.getState().setActive(workspaceId, builder.sessionId)

    const { model, effort, stream } = resolveChatRunOptions(
      modelData,
      layout.selectedModel,
      layout.selectedEffort
    )

    try {
      await submitMutation.mutateAsync({
        builderId: builder.id,
        requirements: text,
        optimisticId,
        model,
        effort,
        stream
      })
    } catch (error) {
      liveStore.getState().setProcessing(workspaceId, builder.sessionId, false)
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
