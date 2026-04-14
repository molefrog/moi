import { useSessionsStore } from '@/client/store/sessions'
import { useWorkspaceStore } from '@/client/store/workspace'
import type { ChatMessage, ClientMessage } from '@/lib/types'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let currentWorkspaceId = ''
const queue: ClientMessage[] = []

export function connectWs(workspaceId: string) {
  // Reconnect if workspace changed
  if (ws && currentWorkspaceId !== workspaceId) disconnectWs()
  if (ws) return

  currentWorkspaceId = workspaceId

  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const socket = new WebSocket(
    `ws://${location.host}/ws?workspace=${encodeURIComponent(workspaceId)}`
  )

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

      case 'workspace:switch': {
        // Notify any registered handler (e.g. to navigate)
        onWorkspaceSwitch?.(data.workspaceId as string)
        return
      }

      default: {
        const sid = data.sessionId as string | undefined
        if (!sid) return
        store.append(sid, data as unknown as ChatMessage)
      }
    }
  }

  socket.onclose = () => {
    ws = null
    reconnectTimer = setTimeout(() => connectWs(currentWorkspaceId), 1000)
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

let onWorkspaceSwitch: ((workspaceId: string) => void) | null = null

export function setWorkspaceSwitchHandler(fn: ((workspaceId: string) => void) | null) {
  onWorkspaceSwitch = fn
}
