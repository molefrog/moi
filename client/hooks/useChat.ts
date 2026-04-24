import { useCallback, useEffect } from 'react'
import { useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { connectWs, disconnectWs, sendWs } from '@/client/lib/ws'
import { useSessionsStore } from '@/client/store/sessions'
import { useWorkspaceStore } from '@/client/store/workspace'
import { emptyViewState } from '@/lib/format'
import type { ViewState } from '@/lib/types'

const EMPTY: ViewState = emptyViewState()

export function useChat() {
  const workspaceId = useWorkspaceId()
  const [input, setInput] = useState('')

  const activeSessionId = useWorkspaceStore(s => s.activeSessionId)
  const setActiveSession = useWorkspaceStore(s => s.setActiveSession)

  const view = useSessionsStore(s => s.views[activeSessionId ?? ''] ?? EMPTY)
  const processing = useSessionsStore(s => s.processing[activeSessionId ?? ''] ?? false)

  // Persistent WS for live events — reconnects if workspace changes
  useEffect(() => {
    connectWs(workspaceId)
    return () => disconnectWs()
  }, [workspaceId])

  // When active session changes and we don't have its events cached, fetch them
  useEffect(() => {
    if (!activeSessionId) return
    if (useSessionsStore.getState().events[activeSessionId] !== undefined) return
    useSessionsStore.getState().loadEvents(workspaceId, activeSessionId)
  }, [workspaceId, activeSessionId])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || processing) return

    let sid = activeSessionId
    let isNew = false
    if (!sid) {
      sid = crypto.randomUUID()
      isNew = true
      useSessionsStore.getState().setEvents(sid, [])
      setActiveSession(sid)
    }

    // Optimistic user turn — rendered immediately, upserted in place when the
    // SDK echoes it back via expectUserEcho on the server.
    const optimisticId = `optimistic:${crypto.randomUUID()}`
    useSessionsStore.getState().append(sid, {
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
    setInput('')
  }, [input, processing, activeSessionId, setActiveSession])

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

  return { view, processing, input, setInput, send, stop, switchThread }
}
