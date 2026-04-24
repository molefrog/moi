import { useSessionsStore } from '@/client/store/sessions'
import { useWorkspaceStore } from '@/client/store/workspace'
import type { ClientMessage, StreamEvent } from '@/lib/types'

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

    // Control frames first
    if (data.type === 'status') {
      store.setProcessing(data.sessionId as string, data.processing as boolean)
      return
    }
    if (data.type === 'session_renamed') {
      const from = data.from as string
      const to = data.to as string
      store.renameSession(from, to)
      if (workspace.activeSessionId === from) workspace.setActiveSession(to)
      return
    }
    if (data.type === 'workspace:switch') {
      onWorkspaceSwitch?.(data.workspaceId as string)
      return
    }

    // StreamEvent frames are tagged by `kind` and carry a sessionId
    const sid = data.sessionId as string | undefined
    if (!sid) return
    if (
      data.kind === 'snapshot' ||
      data.kind === 'turn' ||
      data.kind === 'notice' ||
      data.kind === 'result'
    ) {
      store.append(sid, data as unknown as StreamEvent)
    }
    // `error` and `stopped` frames are ignored for now by the UI — surface later if needed
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
