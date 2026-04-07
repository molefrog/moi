import { useCallback, useEffect, useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { connectWs, disconnectWs, sendWs } from '@/client/lib/ws'
import { useSessionsStore } from '@/client/store/sessions'
import { useWorkspaceStore } from '@/client/store/workspace'
import type { ChatMessage } from '@/lib/types'

const EMPTY: ChatMessage[] = []

export function useChat() {
  const workspaceId = useWorkspaceId()
  const [input, setInput] = useState('')

  const activeSessionId = useWorkspaceStore(s => s.activeSessionId)
  const setActiveSession = useWorkspaceStore(s => s.setActiveSession)

  const messages = useSessionsStore(s => s.messages[activeSessionId ?? ''] ?? EMPTY)
  const processing = useSessionsStore(s => s.processing[activeSessionId ?? ''] ?? false)

  // Persistent WS for live events
  useEffect(() => {
    connectWs()
    return () => disconnectWs()
  }, [])

  // When active session changes and we don't have its messages cached, fetch them
  useEffect(() => {
    if (!activeSessionId) return
    if (useSessionsStore.getState().messages[activeSessionId] !== undefined) return
    useSessionsStore.getState().loadMessages(workspaceId, activeSessionId)
  }, [workspaceId, activeSessionId])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || processing) return

    let sid = activeSessionId
    let isNew = false
    if (!sid) {
      // Client-generated temp UUID for a new session — server will rename on init
      sid = crypto.randomUUID()
      isNew = true
      useSessionsStore.getState().setMessages(sid, [])
      setActiveSession(sid)
    }

    sendWs({ type: 'chat', content: text, sessionId: sid, isNew })
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

  return { messages, processing, input, setInput, send, stop, switchThread }
}
