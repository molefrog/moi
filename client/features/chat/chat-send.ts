import type { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { liveStore } from '@/client/features/chat/chat-store'
import { STREAM_RESPONSES } from '@/client/lib/flags'
import { applyEvent, emptyViewState } from '@/lib/format'
import type { Part, ViewState, WorkspaceModels } from '@/lib/types'

type StartOptimisticTurnInput = {
  queryClient: QueryClient
  workspaceId: string
  sessionId: string
  parts: Part[]
}

export function startOptimisticTurn({
  queryClient,
  workspaceId,
  sessionId,
  parts
}: StartOptimisticTurnInput): string {
  const optimisticId = `optimistic:${crypto.randomUUID()}`
  queryClient.setQueryData<ViewState>(workspaceKeys.events(workspaceId, sessionId), current =>
    applyEvent(current ?? emptyViewState(), {
      kind: 'turn',
      turn: {
        id: optimisticId,
        role: 'user',
        origin: { kind: 'user-input' },
        parts,
        timestamp: new Date().toISOString()
      }
    })
  )
  liveStore.getState().setActivity(workspaceId, sessionId, 'running')
  liveStore.getState().setError(workspaceId, sessionId, null)
  return optimisticId
}

export function resolveChatRunOptions(
  modelsData: WorkspaceModels | undefined,
  pickedModel: string | undefined,
  pickedEffort: string | undefined
): { model?: string; effort?: string; stream?: true } {
  const models = modelsData?.models
  const model =
    !pickedModel || !models || models.some(candidate => candidate.value === pickedModel)
      ? pickedModel
      : undefined
  const modelInfo = models?.find(candidate => candidate.value === model)
  const effort =
    pickedEffort && (!modelInfo || (modelInfo.supportedEffortLevels ?? []).includes(pickedEffort))
      ? pickedEffort
      : undefined
  const stream = STREAM_RESPONSES && modelsData?.supportsStreaming ? true : undefined
  return { model, effort, stream }
}
