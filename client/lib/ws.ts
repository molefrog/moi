import { useSessionsStore } from '@/client/store/sessions'
import { useWorkspaceStore } from '@/client/store/workspace'
import type { ChatMessage, ClientMessage } from '@/lib/types'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const queue: ClientMessage[] = []

export function connectWs() {
  if (ws) return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const socket = new WebSocket(`ws://${location.host}/ws`)

  socket.onopen = () => {
    ws = socket
    for (const msg of queue) socket.send(JSON.stringify(msg))
    queue.length = 0
  }

  socket.onmessage = e => {
    const data = JSON.parse(e.data) as Record<string, unknown>
    const store = useSessionsStore.getState()
    const workspace = useWorkspaceStore.getState()

    switch (data.type) {
      case 'status': {
        store.setProcessing(data.sessionId as string, data.processing as boolean)
        return
      }

      case 'session_renamed': {
        const from = data.from as string
        const to = data.to as string
        store.renameSession(from, to)
        if (workspace.activeSessionId === from) workspace.setActiveSession(to)
        return
      }

      default: {
        // Regular chat event — append by sessionId
        const sid = data.sessionId as string | undefined
        if (!sid) return
        store.append(sid, data as unknown as ChatMessage)
      }
    }
  }

  socket.onclose = () => {
    ws = null
    reconnectTimer = setTimeout(connectWs, 1000)
  }

  socket.onerror = () => {
    socket.close()
  }
}

export function sendWs(msg: ClientMessage) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  } else {
    queue.push(msg)
  }
}

export function disconnectWs() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
  queue.length = 0
}
