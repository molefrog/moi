import { useEffect, useRef } from 'react'

import { wsUrl } from '@/client/lib/ws-url'
import type { ViewBuilder, ViewInfo, WidgetInfo } from '@/lib/types'

export type WorkspaceEvent =
  | { type: 'widget:updated'; name: string }
  | { type: 'widget-layout:updated'; widgets: WidgetInfo[] }
  | { type: 'widgets:refresh' }
  | { type: 'view:updated'; name: string }
  | { type: 'view-layout:updated'; views: ViewInfo[] }
  | { type: 'view-builder:updated'; workspaceId: string; builder: ViewBuilder }
  | { type: 'view-builder:deleted'; workspaceId: string; builderId: string }
  | { type: 'theme:updated' }
  | { type: 'workspace:updated' }
  // The registry list changed (reorder, create) without touching any open
  // workspace's layout — clients refetch just the sidebar list.
  | { type: 'workspaces-list:updated' }
  // A workspace's env changed outside the UI — refetch the env view.
  | { type: 'env:updated'; workspaceId: string }
  // The Scratchpad canvas for `workspaceId` was saved — open tabs reload from
  // disk. `origin` is the tab that wrote it, so that tab can skip its own echo.
  | { type: 'scratchpad:updated'; workspaceId: string; origin?: string }
  // An agent-initiated intent dispatch (`moi intent <name>`, docs/intents.md).
  // Tabs showing `workspaceId` route it through the client resolver
  // (client/features/workspace/intents.ts) to the view declaring the name.
  | {
      type: 'intent:dispatch'
      workspaceId: string
      name: string
      params?: Record<string, unknown>
      source: string
    }

type WorkspaceEventHandler = (event: WorkspaceEvent) => void

const listeners = new Set<WorkspaceEventHandler>()
let ws: WebSocket | null = null
let connecting = false

function ensureConnection() {
  if (ws || connecting) return
  connecting = true

  const socket = new WebSocket(wsUrl('/api/workspaces/ws'))

  socket.onopen = () => {
    ws = socket
    connecting = false
  }

  socket.onmessage = event => {
    try {
      const data = JSON.parse(event.data) as WorkspaceEvent
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

export function useWorkspaceEvent(handler: WorkspaceEventHandler) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const wrapped: WorkspaceEventHandler = e => handlerRef.current(e)
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
