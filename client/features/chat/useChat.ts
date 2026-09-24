import { useCallback, useMemo } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import {
  useSession,
  useSessionView,
  useWorkspaceSessions
} from '@/client/features/chat/sessions/api'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { useSelectedSession } from '@/client/features/chat/sessions/useSelectedSession'
import {
  type WorkspaceTabAddress,
  useMoiUserMessageContext
} from '@/client/features/workspace/moi-context'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { sendMessage } from '@/client/features/chat/connection/chat-connection'
import {
  type ChatSendOptions,
  finishComposerSend,
  moveChatDraft,
  prepareDraftAttachments,
  prepareOptimisticSend,
  attachmentsForSend,
  ownsComposerAttachments,
  resolveChatRunOptions,
  startOptimisticSession
} from '@/client/features/chat/chat-send'
import { visibleForkHistory } from '@/client/features/chat/messages/fork-history'
import { buildPreviewTurn } from '@/client/features/chat/messages/preview-turn'
import {
  isRunningActivity,
  liveStore,
  selectPreviews,
  useLive
} from '@/client/features/chat/chat-store'
import { toast } from '@/client/components/ui/toast'
import { emptyViewState } from '@/lib/format'
import { messageAttachmentLimitError } from '@/lib/message-attachments'
import { draftSessionId } from '@/lib/session-drafts'
import type { ViewState } from '@/lib/types'

const EMPTY: ViewState = emptyViewState()

// Thin projection over app-level state: the selected session comes from
// useSelectedSession, spinner/error come from the live store, and the
// transcript comes from the React Query cache. No socket lifecycle here.
//
// Takes the workspace's tab address because every message carries it: the
// envelope tells the agent which tab the user is on and what the active view
// is rendering with. Call this BELOW `useWorkspaceNavigation`, which owns it.
export function useChat(address: WorkspaceTabAddress) {
  const workspaceId = useWorkspaceId()
  const qc = useQueryClient()
  const { layout } = useWorkspaceLayoutCtx()
  const [selectedSession, selectSession] = useSelectedSession(address.activeTab)
  const modelsData = useWorkspaceAgent(workspaceId).data
  const sessions = useWorkspaceSessions(workspaceId).data
  // A newly forked/native session can precede the provider's session listing.
  // Archive explicitly clears selection; a stale catalog must not do so.
  const selectedSessionId = selectedSession ?? null
  const composerSessionId = selectedSessionId ?? draftSessionId(address.activeTab)
  // Snapshot of the workspace's ambient UI state + queued one-shot
  // directives, taken when the message actually goes out.
  const buildMoiContext = useMoiUserMessageContext(address)

  const activity = useLive(s =>
    selectedSessionId ? (s.activity[`${workspaceId}:${selectedSessionId}`] ?? 'idle') : 'idle'
  )
  // Only running shows the loader/Stop.
  const processing = isRunningActivity(activity)
  const error = useLive(s =>
    selectedSessionId ? (s.errors[`${workspaceId}:${selectedSessionId}`] ?? null) : null
  )

  const viewQuery = useSessionView(workspaceId, selectedSessionId)
  const { refetch } = viewQuery
  const session = useSession(workspaceId, selectedSessionId)
  const { refetch: refetchSession } = session
  const retryLoad = useCallback(async () => {
    await refetch()
    await refetchSession()
  }, [refetch, refetchSession])
  const forkedFromSessionId = session.data?.forkedFromSessionId
  const sessionReady = !selectedSessionId || session.data !== undefined
  let view = sessionReady ? (viewQuery.data ?? EMPTY) : EMPTY
  if (viewQuery.data && forkedFromSessionId) view = visibleForkHistory(viewQuery.data, session.data)
  const chatLoaded =
    selectedSession !== undefined &&
    sessionReady &&
    sessions !== undefined &&
    (selectedSessionId === null || viewQuery.data !== undefined)

  // The live streaming preview as a synthetic assistant turn, so the ChatPanel
  // can merge it into the trailing assistant run — a
  // thinking-only preview then folds into the current tool group instead of
  // rendering as a detached block. The selector returns the stored root-preview
  // object for THIS session (not the whole slice): deltas for other sessions
  // and subagent streams keep its identity, so only the selected session's own
  // stream re-renders the screen hosting this hook. Null when there's nothing
  // visible yet.
  const rootPreview = useLive(s => selectPreviews(s.previews, workspaceId, selectedSessionId).root)
  const previewTurn = useMemo(() => buildPreviewTurn(rootPreview), [rootPreview])

  // The selected session's persisted model/effort. For a brand-new chat (no
  // session yet) this is empty and `send` falls back to workspace defaults.
  const sessionConfig = session.data?.config

  // The composer owns the workspace draft in the persisted UI store and hands
  // the text in, so a keystroke re-renders only the composer.
  const send = useCallback(
    (draft: string, options?: ChatSendOptions) => {
      const text = draft.trim()
      // Attachments stay with the selected session. Only fully-uploaded ones are
      // sent; the composer disables send while any are still uploading, so in
      // practice they're all ready here. Applet sends supply their own prepared
      // attachments and leave the user's staged files alone.
      const ready = attachmentsForSend(workspaceId, composerSessionId, options)
      // No `processing` guard: sending while a turn is in flight QUEUES the
      // message into the same live server session (streaming-input mode).
      if (!text && ready.length === 0 && !options?.preparedAttachments?.attachments.length) return

      const prepared = options?.preparedAttachments ?? prepareDraftAttachments(ready)
      const limitError = messageAttachmentLimitError(prepared.attachments)
      if (limitError) {
        toast.add({ title: 'Couldn’t send message', description: limitError, type: 'error' })
        return
      }

      let sid = selectedSessionId
      let isNew = false
      if (!sid) {
        sid = crypto.randomUUID()
        isNew = true
        // An immediate applet send leaves the user's attachments staged in this chat.
        if (!ownsComposerAttachments(options)) {
          moveChatDraft(workspaceId, composerSessionId, sid)
        }
        selectSession(sid)
        startOptimisticSession({
          tabId: address.activeTab,
          queryClient: qc,
          workspaceId,
          sessionId: sid,
          text,
          filenames: ready.map(attachment => attachment.label)
        })
      }

      const { attachments, optimisticId } = prepareOptimisticSend(
        { queryClient: qc, workspaceId, sessionId: sid, text },
        ready,
        prepared
      )

      // Resolve the session/workspace choice against the catalog. Codex sends
      // the picker's concrete model even for an implicit or stale selection;
      // otherwise its config or resumed thread can choose a different model.
      // Validate effort and Fast mode against that same resolved row.
      const pickedModel = sessionConfig?.model ?? layout.selectedModel
      const pickedEffort = sessionConfig?.effort ?? layout.selectedEffort
      const pickedFastMode = sessionConfig?.fastMode ?? layout.selectedFastMode
      const { model, effort, fastMode, stream } = resolveChatRunOptions(
        modelsData,
        pickedModel,
        pickedEffort,
        pickedFastMode
      )
      sendMessage({
        type: 'chat',
        workspaceId,
        content: text,
        sessionId: sid,
        isNew,
        optimisticId,
        model,
        effort,
        fastMode,
        stream,
        context: buildMoiContext(options),
        ...(attachments.length > 0 ? { attachments } : {})
      })
      finishComposerSend(workspaceId, ready)
      if (isNew) {
        qc.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
      }
    },
    [
      address.activeTab,
      composerSessionId,
      selectedSessionId,
      workspaceId,
      qc,
      layout.selectedModel,
      layout.selectedEffort,
      layout.selectedFastMode,
      buildMoiContext,
      sessionConfig?.model,
      sessionConfig?.effort,
      sessionConfig?.fastMode,
      selectSession,
      modelsData
    ]
  )

  const dismissError = useCallback(() => {
    if (!selectedSessionId) return
    liveStore.getState().setError(workspaceId, selectedSessionId, null)
  }, [selectedSessionId, workspaceId])

  const stop = useCallback(() => {
    if (!processing || !selectedSessionId) return
    sendMessage({ type: 'stop', workspaceId, sessionId: selectedSessionId })
  }, [processing, selectedSessionId, workspaceId])

  return {
    view,
    forkedFromSessionId,
    chatLoaded,
    previewTurn,
    sessionId: selectedSessionId,
    composerSessionId,
    processing,
    error,
    loadError: session.error?.message ?? viewQuery.error?.message ?? null,
    retryLoad,
    send,
    stop,
    selectSession,
    dismissError
  }
}
