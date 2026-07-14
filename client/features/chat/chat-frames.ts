import type { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { getScratchExecutor } from '@/client/features/scratchpad/scratch-executor'
import { liveStore } from '@/client/features/chat/chat-store'
import { applyEvent } from '@/lib/format'
import type {
  ClientMessage,
  PreviewFrame,
  ScratchOp,
  StreamEvent,
  ThreadConfig,
  ViewState
} from '@/lib/types'

type ChatFrameContext = {
  queryClient: QueryClient | null
  sendMessage: (message: ClientMessage) => void
  onWorkspaceSwitch: ((workspaceId: string) => void) | null
}

export function reduceChatFrame(data: Record<string, unknown>, context: ChatFrameContext) {
  const { queryClient, sendMessage, onWorkspaceSwitch } = context
  const store = liveStore.getState()

  if (data.type === 'status_snapshot') {
    store.reconcileProcessing(
      (data.running as { workspaceId: string; sessionId: string }[] | undefined) ?? []
    )
    return
  }
  if (data.type === 'status') {
    const workspaceId = data.workspaceId as string
    const sessionId = data.sessionId as string
    const processing = data.processing as boolean
    store.setProcessing(workspaceId, sessionId, processing)
    if (!processing) store.clearPreviewsForSession(workspaceId, sessionId)
    return
  }
  if (data.type === 'preview') {
    const frame = data as unknown as PreviewFrame
    const key = workspaceKeys.events(frame.workspaceId, frame.sessionId)
    if (queryClient?.getQueryData(key) === undefined) return
    store.setPreview({
      workspaceId: frame.workspaceId,
      sessionId: frame.sessionId,
      messageId: frame.messageId,
      parentToolUseId: frame.parentToolUseId,
      blocks: frame.blocks
    })
    return
  }
  if (data.type === 'session_renamed') {
    const workspaceId = data.workspaceId as string
    const from = data.from as string
    const to = data.to as string
    store.renameSession(workspaceId, from, to)

    const previousView = queryClient?.getQueryData<ViewState>(
      workspaceKeys.events(workspaceId, from)
    )
    if (previousView !== undefined) {
      queryClient?.setQueryData(workspaceKeys.events(workspaceId, to), previousView)
      queryClient?.removeQueries({ queryKey: workspaceKeys.events(workspaceId, from) })
    }

    const previousConfig = queryClient?.getQueryData<ThreadConfig>(
      workspaceKeys.threadConfig(workspaceId, from)
    )
    if (previousConfig !== undefined) {
      queryClient?.setQueryData(workspaceKeys.threadConfig(workspaceId, to), previousConfig)
      queryClient?.removeQueries({ queryKey: workspaceKeys.threadConfig(workspaceId, from) })
    }
    queryClient?.invalidateQueries({ queryKey: workspaceKeys.sessions(workspaceId) })
    return
  }
  if (data.type === 'workspace:switch') {
    onWorkspaceSwitch?.(data.workspaceId as string)
    return
  }
  if (data.type === 'scratchpad:op') {
    const run = getScratchExecutor(data.workspaceId as string)
    if (!run) return
    const opId = data.opId as string
    run(data.op as ScratchOp).then(
      result => sendMessage({ type: 'scratchpad:op-result', opId, result }),
      error =>
        sendMessage({
          type: 'scratchpad:op-result',
          opId,
          error: error instanceof Error ? error.message : String(error)
        })
    )
    return
  }

  const workspaceId = data.workspaceId as string | undefined
  const sessionId = data.sessionId as string | undefined
  if (!workspaceId || !sessionId) return
  const kind = data.kind

  if (kind === 'snapshot' || kind === 'turn' || kind === 'notice' || kind === 'result') {
    patchView(queryClient, workspaceId, sessionId, data as unknown as StreamEvent)
    if (kind === 'turn') {
      const messageId = (data as unknown as { turn?: { meta?: { apiMessageId?: string } } }).turn
        ?.meta?.apiMessageId
      if (messageId) store.clearPreview(messageId)
    }
    if (kind === 'result') store.clearPreviewsForSession(workspaceId, sessionId)
  }
  if (kind === 'error' && typeof data.content === 'string') {
    store.setError(workspaceId, sessionId, data.content)
    store.clearPreviewsForSession(workspaceId, sessionId)
  }
  if (kind === 'stopped') {
    store.setProcessing(workspaceId, sessionId, false)
    store.clearPreviewsForSession(workspaceId, sessionId)
  }
}

function patchView(
  queryClient: QueryClient | null,
  workspaceId: string,
  sessionId: string,
  event: StreamEvent
) {
  const queryKey = workspaceKeys.events(workspaceId, sessionId)
  const existing = queryClient?.getQueryData<ViewState>(queryKey)
  if (existing === undefined) return
  queryClient?.setQueryData<ViewState>(queryKey, applyEvent(existing, event))
}
