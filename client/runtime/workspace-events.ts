import type { NavigationRequest } from '@/lib/navigation'
import type { AppSettings, HarnessAvailability, ViewInfo, WidgetInfo } from '@/lib/types'

export type WorkspaceEvent =
  | { type: 'widget:updated'; name: string }
  | { type: 'widget-layout:updated'; widgets: WidgetInfo[] }
  // `moi refresh` — cache-bust and re-fetch applets without a rebuild. `only`
  // narrows to one kind; absent means both widgets and views.
  | { type: 'applets:refresh'; only?: 'widgets' | 'views' }
  | { type: 'view:updated'; name: string }
  | { type: 'view-layout:updated'; views: ViewInfo[] }
  | { type: 'view:deleted'; workspaceId: string; name: string }
  | { type: 'views:changed'; workspaceId: string }
  | { type: 'selected-session:updated'; workspaceId: string; sessionId: string | null }
  // `origin` on an event is the browser tab whose write caused it (absent for
  // CLI and agent changes), so that tab can skip its own echo. See
  // client/lib/browser-tab-id.ts.
  | { type: 'theme:updated'; origin?: string }
  | { type: 'workspace:updated'; origin?: string }
  // The registry list changed (reorder, create) without touching any open
  // workspace's layout — clients refetch just the sidebar list.
  | { type: 'workspaces-list:updated'; origin?: string }
  // A workspace's env changed outside the UI — refetch the env view.
  | { type: 'env:updated'; workspaceId: string }
  // Workspace readiness changed. Patch its cache without a refetch.
  | {
      type: 'harness:updated'
      workspaceId: string
      availability: HarnessAvailability
    }
  // The Scratchpad canvas for `workspaceId` was saved — open tabs reload from
  // disk. `origin` is the tab that wrote it, so that tab can skip its own echo.
  | { type: 'scratchpad:updated'; workspaceId: string; origin?: string }
  // App settings changed (PATCH /api/settings from any client) — carries the
  // new value so caches update without a refetch.
  | { type: 'settings:updated'; settings: AppSettings }
  | NavigationRequest

export type WorkspaceEventHandler = (event: WorkspaceEvent) => void

export type WorkspaceEventsClientOptions = {
  // Delay before reopening after a drop. It doubles on repeated drops, up to
  // the max, so a downed server isn't hammered; it resets once a socket opens.
  reconnectBaseDelayMs?: number
  reconnectMaxDelayMs?: number
}

// The page's workspace events socket. `AppProvider` opens it when the app
// mounts and closes it when the app unmounts; subscribers come and go freely
// in between without touching the connection. A dropped socket reopens on its
// own. Framework-free, so the connection logic is testable without React.
export class WorkspaceEventsClient {
  private readonly listeners = new Set<WorkspaceEventHandler>()
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  // The socket being opened or open; undefined while disconnected.
  private socket: WebSocket | undefined
  private closed = true
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private shownWorkspace: string | undefined

  constructor(
    private readonly url: string,
    options: WorkspaceEventsClientOptions = {}
  ) {
    this.baseDelayMs = options.reconnectBaseDelayMs ?? 1000
    this.maxDelayMs = options.reconnectMaxDelayMs ?? 30_000
  }

  connect() {
    this.closed = false
    this.open()
  }

  // Shut the connection down for good; no reconnect follows.
  close() {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    const socket = this.socket
    this.socket = undefined
    socket?.close()
  }

  subscribe(handler: WorkspaceEventHandler): () => void {
    this.listeners.add(handler)
    return () => {
      this.listeners.delete(handler)
    }
  }

  send(message: object) {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(message))
  }

  // The workspace this tab shows, for the server's navigation relay. Sent now
  // and again on every reconnect.
  get navigationWorkspace(): string | undefined {
    return this.shownWorkspace
  }

  setNavigationWorkspace(workspaceId: string | undefined) {
    this.shownWorkspace = workspaceId
    this.sendNavigationPresence()
  }

  sendNavigationPresence() {
    this.send({
      type: 'navigation:presence',
      // The wire format uses `null` for "no workspace".
      workspaceId: this.shownWorkspace ?? null,
      focused: document.visibilityState === 'visible' && document.hasFocus()
    })
  }

  private open() {
    if (this.closed || this.socket) return
    const socket = new WebSocket(this.url)
    this.socket = socket

    socket.onopen = () => {
      this.reconnectAttempt = 0
      this.sendNavigationPresence()
    }

    socket.onmessage = event => {
      try {
        const data = JSON.parse(event.data) as WorkspaceEvent
        for (const handler of this.listeners) handler(data)
      } catch {}
    }

    socket.onclose = () => {
      // A socket this client already let go of (closed or replaced).
      if (this.socket !== socket) return
      this.socket = undefined
      if (!this.closed) this.scheduleReconnect()
    }

    socket.onerror = () => {
      socket.close()
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(this.baseDelayMs * 2 ** this.reconnectAttempt, this.maxDelayMs)
    this.reconnectAttempt++
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }
}
