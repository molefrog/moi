import { useCallback, useEffect } from 'react'
import { useState } from 'react'

import { useWorkspaceModels } from '@/client/api/workspaces'
import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { connectWs, disconnectWs, sendWs } from '@/client/lib/ws'
import { useChatStore, useChatStoreApi } from '@/client/store/chat'
import { emptyViewState } from '@/lib/format'
import type { ViewState } from '@/lib/types'

const EMPTY: ViewState = emptyViewState()

export function useChat() {
  const workspaceId = useWorkspaceId()
  const store = useChatStoreApi()
  const { layout } = useWorkspaceLayoutCtx()
  const models = useWorkspaceModels(workspaceId).data?.models
  const [input, setInput] = useState('')

  const activeSessionId = useChatStore(s => s.activeSessionId)
  const setActiveSession = useChatStore(s => s.setActiveSession)

  const view = useChatStore(s => s.views[activeSessionId ?? ''] ?? EMPTY)
  const processing = useChatStore(s => s.processing[activeSessionId ?? ''] ?? false)
  const error = useChatStore(s => s.errors[activeSessionId ?? ''] ?? null)

  // Persistent WS for live events — reconnects if workspace changes. Hands the
  // workspace's chat store to the (non-React) socket layer so it writes there.
  useEffect(() => {
    connectWs(workspaceId, store)
    return () => disconnectWs()
  }, [workspaceId, store])

  // When active session changes and we don't have its events cached, fetch them
  useEffect(() => {
    if (!activeSessionId) return
    if (store.getState().events[activeSessionId] !== undefined) return
    store.getState().loadEvents(workspaceId, activeSessionId)
  }, [workspaceId, activeSessionId, store])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || processing) return

    let sid = activeSessionId
    let isNew = false
    if (!sid) {
      sid = crypto.randomUUID()
      isNew = true
      store.getState().setEvents(sid, [])
      setActiveSession(sid)
    }

    // Optimistic user turn — rendered immediately, upserted in place when the
    // SDK echoes it back via expectUserEcho on the server.
    const optimisticId = `optimistic:${crypto.randomUUID()}`
    store.getState().append(sid, {
      kind: 'turn',
      turn: {
        id: optimisticId,
        role: 'user',
        origin: { kind: 'user-input' },
        parts: [{ type: 'text', text }],
        timestamp: new Date().toISOString()
      }
    })

    // The picker's persisted choice (layout); undefined runs on the SDK default.
    // Drop it when the models list is loaded and no longer offers it (stale
    // alias / hand-edited layout), matching the picker's display fallback so we
    // don't send a model the SDK would reject with model_not_found.
    const picked = layout.selectedModel
    const model = picked && models && !models.some(m => m.value === picked) ? undefined : picked
    sendWs({ type: 'chat', content: text, sessionId: sid, isNew, optimisticId, model })
    store.getState().setError(sid, null)
    setInput('')
  }, [input, processing, activeSessionId, setActiveSession, store, layout.selectedModel, models])

  const dismissError = useCallback(() => {
    if (!activeSessionId) return
    store.getState().setError(activeSessionId, null)
  }, [activeSessionId, store])

  const stop = useCallback(() => {
    if (!processing || !activeSessionId) return
    sendWs({ type: 'stop', sessionId: activeSessionId })
  }, [processing, activeSessionId])

  const switchThread = useCallback(
    (sessionId: string | null) => {
      setActiveSession(sessionId)
    },
    [setActiveSession]
  )

  return { view, processing, error, input, setInput, send, stop, switchThread, dismissError }
}
