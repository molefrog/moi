import type { QueryClient } from '@tanstack/react-query'

import { wsUrl } from '@/client/lib/ws-url'
import { liveStore } from '@/client/features/chat/chat-store'
import { reduceChatFrame } from '@/client/features/chat/chat-frames'
import type { ClientMessage } from '@/lib/types'

// App-wide chat connection: ONE WebSocket for the whole client, opened once at
// startup and never torn down on navigation. Every server frame is tagged with
// `workspaceId`, so a single socket serves every workspace and the client routes
// each frame to the right `(workspaceId, sessionId)` slice — live transcript
// deltas into the React Query cache, status/error/rename into the live store.
//
// Socket identity is tracked by a monotonic `generation`: each socket captures
// the generation at creation and every callback bails if it's no longer current,
// so a delayed close/open from a superseded socket can't corrupt live state.

let qc: QueryClient | null = null
let socket: WebSocket | null = null
let generation = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
const queue: ClientMessage[] = []
let onWorkspaceSwitch: ((workspaceId: string) => void) | null = null
let sweepTimer: ReturnType<typeof setInterval> | null = null

// TTL backstop for live previews. Every clear path (turn arrival, run end,
// reconnect) is exact and should fire first; this only reaps a preview whose
// clear was somehow missed, so it can be generous.
const PREVIEW_TTL_MS = 15_000

export function initConnection(queryClient: QueryClient) {
  qc = queryClient
  if (!sweepTimer) {
    sweepTimer = setInterval(
      () => liveStore.getState().sweepPreviews(PREVIEW_TTL_MS, Date.now()),
      5_000
    )
  }
  if (socket) return // already connected (mount/StrictMode re-invoke safety)
  connect()
}

function connect() {
  const myGen = ++generation
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const s = new WebSocket(wsUrl('/ws'))
  socket = s

  s.onopen = () => {
    if (generation !== myGen) {
      s.close()
      return
    }
    for (const m of queue) s.send(JSON.stringify(m))
    queue.length = 0
    // Heal any deltas missed while disconnected: refetch every live transcript.
    // No-op on the first connect (nothing cached yet).
    qc?.invalidateQueries({ queryKey: ['workspaces', 'events'] })
    // Any in-flight preview from before the drop is superseded by that refetch
    // (which returns the authoritative disk state) — drop them all so a frozen
    // half-streamed preview can't linger over the healed transcript.
    liveStore.getState().clearAllPreviews()
  }

  s.onmessage = e => {
    if (generation !== myGen) return
    let data: unknown
    try {
      data = JSON.parse(e.data)
    } catch {
      return
    }
    handleFrame(data as Record<string, unknown>)
  }

  s.onclose = () => {
    if (generation !== myGen) return
    socket = null
    reconnectTimer = setTimeout(connect, 1000)
  }

  s.onerror = () => s.close()
}

export function handleFrame(data: Record<string, unknown>) {
  reduceChatFrame(data, { queryClient: qc, sendMessage, onWorkspaceSwitch })
}

export function sendMessage(msg: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
  else queue.push(msg)
}

export function setWorkspaceSwitchHandler(fn: ((workspaceId: string) => void) | null) {
  onWorkspaceSwitch = fn
}

// Test seam: inject the QueryClient the frame handler reads, without opening a
// socket (the browser-only `connect()` path). Production always goes through
// `initConnection`.
export function __setQueryClientForTests(client: QueryClient | null) {
  qc = client
}
