import type { QueryClient } from '@tanstack/react-query'

import { workspaceKeys } from '@/client/api/workspaces'
import { getScratchExecutor } from '@/client/lib/scratch-executor'
import { wsUrl } from '@/client/lib/ws-url'
import { liveStore } from '@/client/store/live'
import { applyEvent } from '@/lib/format'
import type {
  ClientMessage,
  PreviewFrame,
  ScratchOp,
  StreamEvent,
  ThreadConfig,
  ViewState
} from '@/lib/types'

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
  const store = liveStore.getState()

  // Control frames first.
  if (data.type === 'status_snapshot') {
    store.reconcileProcessing(
      (data.running as { workspaceId: string; sessionId: string }[] | undefined) ?? []
    )
    return
  }
  if (data.type === 'status') {
    const workspaceId = data.workspaceId as string
    const sessionId = data.sessionId as string
    const processing = data.processing as boolean
    store.setProcessing(workspaceId, sessionId, processing)
    // Run fully ended → any leftover preview for this session is stale (its
    // finalized turns already arrived). Belt for a per-message clear that was
    // missed (e.g. a turn that carried no apiMessageId).
    if (!processing) store.clearPreviewsForSession(workspaceId, sessionId)
    return
  }
  if (data.type === 'preview') {
    const frame = data as unknown as PreviewFrame
    // Only hold previews for a thread whose transcript is loaded (mirrors
    // patchView): keeps the store bounded and never renders a preview over a
    // history-less background session that would then never refetch.
    const key = workspaceKeys.events(frame.workspaceId, frame.sessionId)
    if (qc?.getQueryData(key) === undefined) return
    store.setPreview({
      workspaceId: frame.workspaceId,
      sessionId: frame.sessionId,
      messageId: frame.messageId,
      parentToolUseId: frame.parentToolUseId,
      blocks: frame.blocks
    })
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
    // Likewise move any per-thread config the picker wrote under the temp id, so
    // a model/effort change made before the rename lands isn't stranded. The
    // server migrates the stored config in renameSession to match.
    const cfg = qc?.getQueryData<ThreadConfig>(workspaceKeys.threadConfig(workspaceId, from))
    if (cfg !== undefined) {
      qc?.setQueryData(workspaceKeys.threadConfig(workspaceId, to), cfg)
      qc?.removeQueries({ queryKey: workspaceKeys.threadConfig(workspaceId, from) })
    }
    // The real id now exists on disk — refresh the thread list so it appears.
    qc?.invalidateQueries({ queryKey: workspaceKeys.sessions(workspaceId) })
    return
  }
  if (data.type === 'workspace:switch') {
    onWorkspaceSwitch?.(data.workspaceId as string)
    return
  }

  // A relayed Scratchpad op from `moi scratch`. Only run it if THIS tab has a
  // live editor for that workspace; otherwise ignore (another tab — or none —
  // handles it, and the server times out if no tab answers). Ids are
  // deterministic, so if several tabs run it they converge; first reply wins.
  if (data.type === 'scratchpad:op') {
    const run = getScratchExecutor(data.workspaceId as string)
    if (!run) return
    const opId = data.opId as string
    run(data.op as ScratchOp).then(
      result => sendMessage({ type: 'scratchpad:op-result', opId, result }),
      err =>
        sendMessage({
          type: 'scratchpad:op-result',
          opId,
          error: err instanceof Error ? err.message : String(err)
        })
    )
    return
  }

  // StreamEvent frames — tagged with workspaceId + sessionId.
  const workspaceId = data.workspaceId as string | undefined
  const sessionId = data.sessionId as string | undefined
  if (!workspaceId || !sessionId) return
  const kind = data.kind

  if (kind === 'snapshot' || kind === 'turn' || kind === 'notice' || kind === 'result') {
    patchView(workspaceId, sessionId, data as unknown as StreamEvent)
    // The real turn superseding a live preview is the clean handoff: drop the
    // preview for that exact message id the instant its finalized turn lands, so
    // there's no double-render and no flicker (both updates commit together).
    if (kind === 'turn') {
      const mid = (data as unknown as { turn?: { meta?: { apiMessageId?: string } } }).turn?.meta
        ?.apiMessageId
      if (mid) store.clearPreview(mid)
    }
    // A `result` ends the turn — sweep any preview that never got an exact clear.
    if (kind === 'result') store.clearPreviewsForSession(workspaceId, sessionId)
  }
  if (kind === 'error' && typeof data.content === 'string') {
    store.setError(workspaceId, sessionId, data.content)
    store.clearPreviewsForSession(workspaceId, sessionId)
  }
  if (kind === 'stopped') {
    store.setProcessing(workspaceId, sessionId, false)
    store.clearPreviewsForSession(workspaceId, sessionId)
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

// Test seam: inject the QueryClient the frame handler reads, without opening a
// socket (the browser-only `connect()` path). Production always goes through
// `initConnection`.
export function __setQueryClientForTests(client: QueryClient | null) {
  qc = client
}
