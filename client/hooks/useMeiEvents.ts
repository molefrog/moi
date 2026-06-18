import { useEffect, useRef } from 'react'

import type { ViewInfo, WidgetInfo } from '@/lib/types'

export type MeiEvent =
  | { type: 'widget:updated'; name: string }
  | { type: 'widget-layout:updated'; widgets: WidgetInfo[] }
  | { type: 'widgets:refresh' }
  | { type: 'view:updated'; name: string }
  | { type: 'view-layout:updated'; views: ViewInfo[] }
  | { type: 'theme:updated' }
  | { type: 'workspace:updated' }

type MeiEventHandler = (event: MeiEvent) => void

const listeners = new Set<MeiEventHandler>()
let ws: WebSocket | null = null
let connecting = false

function ensureConnection() {
  if (ws || connecting) return
  connecting = true

  const socket = new WebSocket(`ws://${location.host}/api/workspaces/ws`)

  socket.onopen = () => {
    ws = socket
    connecting = false
  }

  socket.onmessage = event => {
    try {
      const data = JSON.parse(event.data) as MeiEvent
      for (const handler of listeners) handler(data)
    } catch {}
  }

  socket.onclose = () => {
    ws = null
    connecting = false
    // Reconnect after 2s if there are still listeners
    if (listeners.size > 0) {
      setTimeout(ensureConnection, 2000)
    }
  }

  socket.onerror = () => {
    socket.close()
  }
}

export function useMeiEvent(handler: MeiEventHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapped: MeiEventHandler = e => handlerRef.current(e)
    listeners.add(wrapped)
    ensureConnection()

    return () => {
      listeners.delete(wrapped)
      // Close WS if no more listeners
      if (listeners.size === 0 && ws) {
        ws.close()
        ws = null
      }
    }
  }, [])
}
