import { useEffect, useRef } from 'react'

import { wsUrl } from '@/client/lib/ws-url'
import type {
  AgentLoginState,
  AppSettings,
  HarnessAvailability,
  ViewBuilder,
  ViewInfo,
  WidgetInfo,
  WorkspaceTabId
} from '@/lib/types'

export type WorkspaceEvent =
  | { type: 'widget:updated'; name: string }
  | { type: 'widget-layout:updated'; widgets: WidgetInfo[] }
  // `moi refresh` — cache-bust and re-fetch applets without a rebuild. `only`
  // narrows to one kind; absent means both widgets and views.
  | { type: 'applets:refresh'; only?: 'widgets' | 'views' }
  | { type: 'view:updated'; name: string }
  | { type: 'view-layout:updated'; views: ViewInfo[] }
  | { type: 'view-builder:updated'; workspaceId: string; builder: ViewBuilder }
  | { type: 'view-builder:deleted'; workspaceId: string; builderId: string }
  | { type: 'selected-session:updated'; workspaceId: string; sessionId: string | null }
  | { type: 'theme:updated' }
  | { type: 'workspace:updated' }
  // The registry list changed (reorder, create) without touching any open
  // workspace's layout — clients refetch just the sidebar list.
  | { type: 'workspaces-list:updated' }
  // A workspace's env changed outside the UI — refetch the env view.
  | { type: 'env:updated'; workspaceId: string }
  // The agent backend's availability or login ceremony changed (login landed,
  // ceremony timed out, auth probe flipped). Carries the new state so caches
  // patch without a refetch.
  | {
      type: 'agent:updated'
      workspaceId: string
      availability: HarnessAvailability
      login?: AgentLoginState
    }
  // The Scratchpad canvas for `workspaceId` was saved — open tabs reload from
  // disk. `origin` is the tab that wrote it, so that tab can skip its own echo.
  | { type: 'scratchpad:updated'; workspaceId: string; origin?: string }
  // App settings changed (PATCH /api/settings from any client) — carries the
  // new value so caches update without a refetch.
  | { type: 'settings:updated'; settings: AppSettings }
  // `moi tab focus` — every open client of `workspaceId` navigates (replace)
  // to `tab`, delivering `params` to the target view via navigation state.
  | {
      type: 'tab:focus'
      workspaceId: string
      tab: WorkspaceTabId
      params?: Record<string, unknown>
    }

type WorkspaceEventHandler = (event: WorkspaceEvent) => void

const listeners = new Set<WorkspaceEventHandler>()
// Fired when the socket comes back after a drop — for the SPA that means the
// server restarted (it holds the connection for its whole lifetime), so
// restart-scoped state such as the startup config can refetch.
const reconnectListeners = new Set<() => void>()
let everConnected = false
let ws: WebSocket | null = null
let connecting = false

function ensureConnection() {
  if (ws || connecting) return
  connecting = true

  const socket = new WebSocket(wsUrl('/api/workspaces/ws'))

  socket.onopen = () => {
    ws = socket
    connecting = false
    if (everConnected) for (const handler of reconnectListeners) handler()
    everConnected = true
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

// Subscribe to reconnects; returns the unsubscribe. Only fires while some
// component holds the events socket open via useWorkspaceEvent (the app shell
// always does).
export function onWorkspaceEventsReconnect(handler: () => void): () => void {
  reconnectListeners.add(handler)
  return () => {
    reconnectListeners.delete(handler)
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
