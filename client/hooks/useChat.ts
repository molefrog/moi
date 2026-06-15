import { useCallback, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { useSessionView, useWorkspaceModels, workspaceKeys } from '@/client/api/workspaces'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { sendMessage } from '@/client/lib/connection'
import { liveStore, useLive } from '@/client/store/live'
import { applyEvent, emptyViewState } from '@/lib/format'
import type { ViewState } from '@/lib/types'

const EMPTY: ViewState = emptyViewState()

// Thin projection over app-level state: the active thread + spinner/error come
// from the live store; the transcript comes from the React Query cache (kept
// current by the connection manager's WS deltas). No socket lifecycle here.
export function useChat() {
  const workspaceId = useWorkspaceId()
  const qc = useQueryClient()
  const { layout } = useWorkspaceLayoutCtx()
  const models = useWorkspaceModels(workspaceId).data?.models
  const [input, setInput] = useState('')

  const activeSessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)
  const processing = useLive(s =>
    activeSessionId ? (s.processing[`${workspaceId}:${activeSessionId}`] ?? false) : false
  )
  const error = useLive(s =>
    activeSessionId ? (s.errors[`${workspaceId}:${activeSessionId}`] ?? null) : null
  )

  const view = useSessionView(workspaceId, activeSessionId).data ?? EMPTY

  const send = useCallback(() => {
    const text = input.trim()
    // No `processing` guard: sending while a turn is in flight QUEUES the
    // message into the same live server session (streaming-input mode).
    if (!text) return

    let sid = activeSessionId
    let isNew = false
    if (!sid) {
      sid = crypto.randomUUID()
      isNew = true
      liveStore.getState().setActive(workspaceId, sid)
    }

    // Optimistic user turn — primed into the RQ transcript cache so it renders
    // immediately. The server re-ids the SDK's user echo to optimisticId so it
    // upserts in place rather than duplicating.
    const optimisticId = `optimistic:${crypto.randomUUID()}`
    qc.setQueryData<ViewState>(workspaceKeys.events(workspaceId, sid), prev =>
      applyEvent(prev ?? emptyViewState(), {
        kind: 'turn',
        turn: {
          id: optimisticId,
          role: 'user',
          origin: { kind: 'user-input' },
          parts: [{ type: 'text', text }],
          timestamp: new Date().toISOString()
        }
      })
    )
    liveStore.getState().setProcessing(workspaceId, sid, true)
    liveStore.getState().setError(workspaceId, sid, null)

    // The picker's persisted choice; drop it when the loaded models list no
    // longer offers it (stale alias) so the SDK doesn't reject model_not_found.
    const picked = layout.selectedModel
    const model = picked && models && !models.some(m => m.value === picked) ? undefined : picked
    sendMessage({
      type: 'chat',
      workspaceId,
      content: text,
      sessionId: sid,
      isNew,
      optimisticId,
      model
    })
    setInput('')
  }, [input, activeSessionId, workspaceId, qc, layout.selectedModel, models])

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

  return { view, processing, error, input, setInput, send, stop, switchThread, dismissError }
}
