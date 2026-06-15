import type { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspaces'
import { liveStore } from '@/client/store/live'
import { applyEvent } from '@/lib/format'
import type { ClientMessage, StreamEvent, ViewState } from '@/lib/types'

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

export function initConnection(queryClient: QueryClient) {
  qc = queryClient
  if (socket) return // already connected (mount/StrictMode re-invoke safety)
  connect()
}

function connect() {
  const myGen = ++generation
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const s = new WebSocket(`ws://${location.host}/ws`)
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

function handleFrame(data: Record<string, unknown>) {
  const store = liveStore.getState()

  // Control frames first.
  if (data.type === 'status_snapshot') {
    store.reconcileProcessing(
      (data.running as { workspaceId: string; sessionId: string }[] | undefined) ?? []
    )
    return
  }
  if (data.type === 'status') {
    store.setProcessing(
      data.workspaceId as string,
      data.sessionId as string,
      data.processing as boolean
    )
    return
  }
  if (data.type === 'session_renamed') {
    const workspaceId = data.workspaceId as string
    const from = data.from as string
    const to = data.to as string
    store.renameSession(workspaceId, from, to)
    // Move the cached transcript from the client's temp id to the real one.
    const prev = qc?.getQueryData<ViewState>(workspaceKeys.events(workspaceId, from))
    if (prev !== undefined) {
      qc?.setQueryData(workspaceKeys.events(workspaceId, to), prev)
      qc?.removeQueries({ queryKey: workspaceKeys.events(workspaceId, from) })
    }
    // The real id now exists on disk — refresh the thread list so it appears.
    qc?.invalidateQueries({ queryKey: workspaceKeys.sessions(workspaceId) })
    return
  }
  if (data.type === 'workspace:switch') {
    onWorkspaceSwitch?.(data.workspaceId as string)
    return
  }

  // StreamEvent frames — tagged with workspaceId + sessionId.
  const workspaceId = data.workspaceId as string | undefined
  const sessionId = data.sessionId as string | undefined
  if (!workspaceId || !sessionId) return
  const kind = data.kind

  if (kind === 'snapshot' || kind === 'turn' || kind === 'notice' || kind === 'result') {
    patchView(workspaceId, sessionId, data as unknown as StreamEvent)
  }
  if (kind === 'error' && typeof data.content === 'string') {
    store.setError(workspaceId, sessionId, data.content)
  }
  if (kind === 'stopped') {
    store.setProcessing(workspaceId, sessionId, false)
  }
}

// Fold a delta into a thread's cached transcript — but only if that transcript
// is already loaded/primed. A never-viewed background session has no cache
// entry; we deliberately skip it so a stray mid-run delta can't seed a partial,
// history-less view that would then never refetch. It loads in full from disk
// when the user actually opens it.
function patchView(workspaceId: string, sessionId: string, ev: StreamEvent) {
  const queryKey = workspaceKeys.events(workspaceId, sessionId)
  const existing = qc?.getQueryData<ViewState>(queryKey)
  if (existing === undefined) return
  qc?.setQueryData<ViewState>(queryKey, applyEvent(existing, ev))
}

export function sendMessage(msg: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg))
  else queue.push(msg)
}

export function setWorkspaceSwitchHandler(fn: ((workspaceId: string) => void) | null) {
  onWorkspaceSwitch = fn
}
