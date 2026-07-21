import { useCallback, useMemo } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspace-keys'
import { useSessionView, useThreadConfig, useWorkspaceModels } from '@/client/features/chat/api'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { sendMessage } from '@/client/features/chat/chat-connection'
import { resolveChatRunOptions, startOptimisticTurn } from '@/client/features/chat/chat-send'
import { buildPreviewTurn } from '@/client/features/chat/preview-turn'
import { draftKey, liveStore, selectPreviews, useLive } from '@/client/features/chat/chat-store'
import { emptyViewState } from '@/lib/format'
import { renderMoiContext } from '@/lib/moi-context'
import type { Part, ViewState } from '@/lib/types'

const EMPTY: ViewState = emptyViewState()

// Thin projection over app-level state: the active thread + spinner/error come
// from the live store; the transcript comes from the React Query cache (kept
// current by the connection manager's WS deltas). No socket lifecycle here.
export function useChat() {
  const workspaceId = useWorkspaceId()
  const qc = useQueryClient()
  const { layout } = useWorkspaceLayoutCtx()
  const modelsData = useWorkspaceModels(workspaceId).data

  const activeSessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)
  const activity = useLive(s =>
    activeSessionId ? (s.activity[`${workspaceId}:${activeSessionId}`] ?? 'idle') : 'idle'
  )
  // Only `running` shows the loader/Stop. `requires-action` (agent blocked on
  // user input) deliberately renders like idle until it gets its own UI.
  const processing = activity === 'running'
  const error = useLive(s =>
    activeSessionId ? (s.errors[`${workspaceId}:${activeSessionId}`] ?? null) : null
  )

  const view = useSessionView(workspaceId, activeSessionId).data ?? EMPTY

  // The live streaming preview as a synthetic assistant turn, so the ChatPanel
  // can run it through the SAME groupTurns pipeline as finalized turns — a
  // thinking-only preview then folds into the current tool group instead of
  // rendering as a detached block. Recomputed per delta (the previews slice is
  // stable across other updates); null when there's nothing visible yet.
  const previews = useLive(s => s.previews)
  const previewTurn = useMemo(
    () => buildPreviewTurn(selectPreviews(previews, workspaceId, activeSessionId).root),
    [previews, workspaceId, activeSessionId]
  )

  // The active thread's persisted model/effort. For a brand-new chat (no thread
  // yet) this is empty and `send` falls back to the workspace defaults below.
  const threadCfg = useThreadConfig(workspaceId, activeSessionId).data

  // The composer owns the draft (in the live store) and hands the text in, so a
  // keystroke re-renders only the composer — not this hook's host (WorkspaceView)
  // and its whole subtree. See `ChatInput`.
  const send = useCallback(
    (draft: string) => {
      const text = draft.trim()
      // Attachments for the active thread, keyed exactly like the draft. Only
      // fully-uploaded ones are sent; the composer disables send while any are
      // still uploading, so in practice they're all ready here.
      const pending = liveStore.getState().attachments[draftKey(workspaceId, activeSessionId)] ?? []
      const ready = pending.filter(a => a.status === 'ready' && a.upload)
      // No `processing` guard: sending while a turn is in flight QUEUES the
      // message into the same live server session (streaming-input mode).
      if (!text && ready.length === 0) return

      let sid = activeSessionId
      let isNew = false
      if (!sid) {
        sid = crypto.randomUUID()
        isNew = true
        liveStore.getState().setActive(workspaceId, sid)
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

      // The thread's persisted choice (workspace defaults for a new chat). Drop a
      // model the loaded list no longer offers (stale alias) so the SDK doesn't
      // reject model_not_found. Drop an effort the resolved model doesn't support
      // (e.g. model changed under it); when the model is unknown/default we can't
      // check, so pass it through — the SDK silently downgrades unsupported effort.
      const pickedModel = threadCfg?.model ?? layout.selectedModel
      const pickedEffort = threadCfg?.effort ?? layout.selectedEffort
      const { model, effort, stream } = resolveChatRunOptions(modelsData, pickedModel, pickedEffort)
      sendMessage({
        type: 'chat',
        workspaceId,
        content: text,
        sessionId: sid,
        isNew,
        optimisticId,
        model,
        effort,
        stream,
        context: renderMoiContext({ activeTab: layout.tabs.active }),
        ...(ready.length > 0 ? { attachments: ready.map(a => a.upload!.id) } : {})
      })
      if (isNew) {
        qc.invalidateQueries({ queryKey: workspaceKeys.preview(workspaceId) })
      }
      // Drop the thread's attachments now that they've been sent (revokes the
      // preview object URLs). Keyed by the pre-mint id, matching where they were
      // stored by the composer.
      liveStore.getState().clearAttachments(workspaceId, activeSessionId)
    },
    [
      activeSessionId,
      workspaceId,
      qc,
      layout.selectedModel,
      layout.selectedEffort,
      layout.tabs.active,
      threadCfg?.model,
      threadCfg?.effort,
      modelsData
    ]
  )

  const dismissError = useCallback(() => {
    if (!activeSessionId) return
    liveStore.getState().setError(workspaceId, activeSessionId, null)
  }, [activeSessionId, workspaceId])

  const stop = useCallback(() => {
    if (!processing || !activeSessionId) return
    sendMessage({ type: 'stop', workspaceId, sessionId: activeSessionId })
  }, [processing, activeSessionId, workspaceId])

  const switchThread = useCallback(
    (sessionId: string | null) => {
      liveStore.getState().setActive(workspaceId, sessionId)
    },
    [workspaceId]
  )

  return {
    view,
    previewTurn,
    sessionId: activeSessionId,
    processing,
    error,
    send,
    stop,
    switchThread,
    dismissError
  }
}
