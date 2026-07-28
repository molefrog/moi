import type { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { type ChatAttachment, draftKey, liveStore } from '@/client/features/chat/chat-store'
import type { MoiUserMessageOptions } from '@/client/features/workspace/moi-context'
import { STREAM_RESPONSES } from '@/client/lib/flags'
import { applyEvent, emptyViewState } from '@/lib/format'
import type { Part, ViewState, WorkspaceModels } from '@/lib/types'

// What a caller may attach to one message beyond its text. All of it is
// envelope material — the agent sees it, the chat bubble does not.
export type ChatSendOptions = MoiUserMessageOptions

// Whether this send owns what the user has staged in the composer. Only a send
// FROM the composer does. An applet's message is not the message the user is
// building, so it must neither carry files they staged for their own message
// nor clear ones still uploading out from under them.
export function ownsComposerAttachments(options?: ChatSendOptions): boolean {
  return !options?.applet
}

// The fully-uploaded attachments this send should carry — none for a send that
// doesn't own the composer's.
export function attachmentsForSend(
  workspaceId: string,
  sessionId: string | null,
  options?: ChatSendOptions
): ChatAttachment[] {
  if (!ownsComposerAttachments(options)) return []
  const pending = liveStore.getState().attachments[draftKey(workspaceId, sessionId)] ?? []
  return pending.filter(a => a.status === 'ready' && a.upload)
}

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
  pickedEffort: string | undefined,
  pickedFastMode?: boolean
): { model?: string; effort?: string; fastMode?: boolean; stream?: true } {
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
  const fastMode =
    pickedFastMode === undefined || !modelInfo || modelInfo.supportsFastMode
      ? pickedFastMode
      : false
  const stream = STREAM_RESPONSES && modelsData?.supportsStreaming ? true : undefined
  return {
    model,
    effort,
    ...(fastMode !== undefined ? { fastMode } : {}),
    stream
  }
}
