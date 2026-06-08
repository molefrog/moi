import { useCallback, useEffect } from 'react'
import { useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { connectWs, disconnectWs, sendWs } from '@/client/lib/ws'
import { useChatStore } from '@/client/store/chat'
import { emptyViewState } from '@/lib/format'
import type { ViewState } from '@/lib/types'

const EMPTY: ViewState = emptyViewState()

export function useChat() {
  const workspaceId = useWorkspaceId()
  const [input, setInput] = useState('')

  const activeSessionId = useChatStore(s => s.activeSessionId)
  const setActiveSession = useChatStore(s => s.setActiveSession)

  const view = useChatStore(s => s.views[activeSessionId ?? ''] ?? EMPTY)
  const processing = useChatStore(s => s.processing[activeSessionId ?? ''] ?? false)
  const error = useChatStore(s => s.errors[activeSessionId ?? ''] ?? null)

  // Persistent WS for live events — reconnects if workspace changes
  useEffect(() => {
    connectWs(workspaceId)
    return () => disconnectWs()
  }, [workspaceId])

  // When active session changes and we don't have its events cached, fetch them
  useEffect(() => {
    if (!activeSessionId) return
    if (useChatStore.getState().events[activeSessionId] !== undefined) return
    useChatStore.getState().loadEvents(workspaceId, activeSessionId)
  }, [workspaceId, activeSessionId])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || processing) return

    let sid = activeSessionId
    let isNew = false
    if (!sid) {
      sid = crypto.randomUUID()
      isNew = true
      useChatStore.getState().setEvents(sid, [])
      setActiveSession(sid)
    }

    // Optimistic user turn — rendered immediately, upserted in place when the
    // SDK echoes it back via expectUserEcho on the server.
    const optimisticId = `optimistic:${crypto.randomUUID()}`
    useChatStore.getState().append(sid, {
      kind: 'turn',
      turn: {
        id: optimisticId,
        role: 'user',
        origin: { kind: 'user-input' },
        parts: [{ type: 'text', text }],
        timestamp: new Date().toISOString()
      }
    })

    sendWs({ type: 'chat', content: text, sessionId: sid, isNew, optimisticId })
    useChatStore.getState().setError(sid, null)
    setInput('')
  }, [input, processing, activeSessionId, setActiveSession])

  const dismissError = useCallback(() => {
    if (!activeSessionId) return
    useChatStore.getState().setError(activeSessionId, null)
  }, [activeSessionId])

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
