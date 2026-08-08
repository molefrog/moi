import { useCallback, useMemo } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { useSessionConfig, useSessionView, useWorkspaceSessions } from '@/client/features/chat/api'
import { useWorkspaceAgent } from '@/client/features/workspace/api'
import { useSelectedSession } from '@/client/features/chat/useSelectedSession'
import {
  type WorkspaceTabAddress,
  useMoiUserMessageContext
} from '@/client/features/workspace/moi-context'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { sendMessage } from '@/client/features/chat/chat-connection'
import {
  type ChatSendOptions,
  attachmentsForSend,
  ownsComposerAttachments,
  resolveChatRunOptions,
  startOptimisticSession,
  startOptimisticTurn
} from '@/client/features/chat/chat-send'
import { buildPreviewTurn } from '@/client/features/chat/preview-turn'
import {
  isRunningActivity,
  liveStore,
  selectPreviews,
  useLive
} from '@/client/features/chat/chat-store'
import { useUiStore } from '@/client/store/ui'
import { emptyViewState } from '@/lib/format'
import type { Part, ViewState } from '@/lib/types'

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
  const [selectedSession, selectSession] = useSelectedSession()
  const selectedSessionId = selectedSession ?? null
  const modelsData = useWorkspaceAgent(workspaceId).data
  const sessions = useWorkspaceSessions(workspaceId).data
  // Snapshot of the workspace's ambient UI state + queued one-shot
  // directives, taken when the message actually goes out.
  const buildMoiContext = useMoiUserMessageContext(address)

  const activity = useLive(s =>
    selectedSessionId ? (s.activity[`${workspaceId}:${selectedSessionId}`] ?? 'idle') : 'idle'
  )
  // Only `running` shows the loader/Stop. `requires-action` (agent blocked on
  // user input) deliberately renders like idle until it gets its own UI.
  const processing = isRunningActivity(activity)
  const error = useLive(s =>
    selectedSessionId ? (s.errors[`${workspaceId}:${selectedSessionId}`] ?? null) : null
  )

  const viewQuery = useSessionView(workspaceId, selectedSessionId)
  const view = viewQuery.data ?? EMPTY
  const chatLoaded =
    sessions !== undefined && (selectedSessionId === null || viewQuery.data !== undefined)

  // The live streaming preview as a synthetic assistant turn, so the ChatPanel
  // can run it through the SAME groupTurns pipeline as finalized turns — a
  // thinking-only preview then folds into the current tool group instead of
  // rendering as a detached block. Recomputed per delta (the previews slice is
  // stable across other updates); null when there's nothing visible yet.
  const previews = useLive(s => s.previews)
  const previewTurn = useMemo(
    () => buildPreviewTurn(selectPreviews(previews, workspaceId, selectedSessionId).root),
    [previews, workspaceId, selectedSessionId]
  )

  // The selected session's persisted model/effort. For a brand-new chat (no
  // session yet) this is empty and `send` falls back to workspace defaults.
  const sessionConfig = useSessionConfig(workspaceId, selectedSessionId).data

  // The composer owns the workspace draft in the persisted UI store and hands
  // the text in, so a keystroke re-renders only the composer.
  const send = useCallback(
    (draft: string, options?: ChatSendOptions) => {
      const text = draft.trim()
      // Attachments stay with the selected session. Only fully-uploaded ones are
      // sent; the composer disables send while any are still uploading, so in
      // practice they're all ready here. An applet send gets none — the staged
      // files are the user's, not the widget's.
      const ready = attachmentsForSend(workspaceId, selectedSessionId, options)
      // No `processing` guard: sending while a turn is in flight QUEUES the
      // message into the same live server session (streaming-input mode).
      if (!text && ready.length === 0) return

      let sid = selectedSessionId
      let isNew = false
      if (!sid) {
        sid = crypto.randomUUID()
        isNew = true
        selectSession(sid)
        startOptimisticSession({
          queryClient: qc,
          workspaceId,
          sessionId: sid,
          text,
          filenames: ready.map(attachment => attachment.name)
        })
      }

      // Optimistic user turn — primed into the RQ transcript cache so it renders
      // immediately. The server re-ids the SDK's user echo to optimisticId so it
      // upserts in place rather than duplicating. Image attachments render from
      // their local object URL until the server's broadcast (with a data URL)
      // upserts in place.
      const parts: Part[] = []
      for (const a of ready) {
        if (a.upload?.kind === 'image' && a.previewUrl) {
          parts.push({ type: 'file', mediaType: a.mediaType, url: a.previewUrl, filename: a.name })
        } else {
          parts.push({ type: 'file', mediaType: a.mediaType, url: '', filename: a.name })
        }
      }
      if (text) parts.push({ type: 'text', text })
      const optimisticId = startOptimisticTurn({
        queryClient: qc,
        workspaceId,
        sessionId: sid,
        parts
      })

      // The session's persisted choice (workspace defaults for a new chat). Drop a
      // model the loaded list no longer offers (stale alias) so the SDK doesn't
      // reject model_not_found. Drop an effort the resolved model doesn't
      // support and explicitly disable Fast mode on a known unsupported model.
      // When the model is unknown/default we can't validate either capability,
      // so pass the stored choices through.
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
        ...(ready.length > 0 ? { attachments: ready.map(a => a.upload!.id) } : {})
      })
      useUiStore.getState().markMessageSentFromMoi(workspaceId)
      if (isNew) {
        qc.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
      }
      // Drop the session's attachments now that they've been sent (revokes the
      // preview object URLs). Keyed by the pre-mint id, matching where they were
      // stored by the composer. Skipped for an applet send, which carried none:
      // clearing here would discard the user's staged (and in-flight) files.
      if (ownsComposerAttachments(options)) {
        liveStore.getState().clearAttachments(workspaceId, selectedSessionId)
      }
    },
    [
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
    chatLoaded,
    previewTurn,
    sessionId: selectedSessionId,
    processing,
    error,
    send,
    stop,
    selectSession,
    dismissError
  }
}
