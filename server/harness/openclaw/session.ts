// Per-(workspaceId, sessionId) live OpenClaw session adapter.
//
// Owns the durable in-memory view for a session and converts each
// `session.message` frame into our `StreamEvent`s. One instance is created
// the first time the workspace's UI asks for its events (via the REST
// endpoint) or sends a chat into it; thereafter it stays subscribed so the
// view is up to date for reattach without re-fetching `sessions.get`.
//
// What this module does NOT do:
//   - Token-delta streaming from `agent`/`chat` events (v2 — we use durable
//     `session.message` rows only, per the design call).
//   - Disk persistence — the gateway is the source of truth; we re-seed from
//     `sessions.get` on cold start.
import { appendAttachmentNote } from '@/lib/attachment-note'
import { stripViewBuilderMeta } from '@/lib/view-builder-meta'
import { applyEvent, emptyViewState } from '@/lib/format'
import type { SessionActivity, StreamEvent, ViewState } from '@/lib/types'

import {
  type OpenClawMessage,
  type OpenClawSessionDetail,
  getOpenClawSessionMessages
} from './discovery'
import {
  type ToolResultInfo,
  findToolCallOwners,
  messageToTurn,
  toolResultFromMessage
} from './adapter'
import { getGateway, onGatewayReconnected } from './gateway'
import { broadcast } from '../../state'
import { materializeToPath, resolveUploads } from '../../uploads'
import {
  markViewBuilderBuildingBySession,
  markViewBuilderWaitingBySession,
  renameViewBuilderSession
} from '../../view-builders'

type OpenClawSessionKey = string // the gateway-side composite key, e.g. `agent:main:main`

type SessionRecord = {
  workspaceId: string
  workspacePath: string
  agentId: string
  sessionId: string
  sessionKey: OpenClawSessionKey
  // arrival-ordered map keyed by __openclaw.id so we can re-emit owners when
  // a result lands. We rely on insertion-order iteration to preserve order.
  messagesById: Map<string, OpenClawMessage>
  results: Map<string, ToolResultInfo>
  view: ViewState
  activeRunId: string | null
  ingestUnsubscribe?: () => void
  // Set once the cold seed has finished, so live frames that arrive
  // mid-seed are queued and applied after.
  seeded: boolean
  pendingFrames: OpenClawMessage[]
  // Optimistic id rendezvous: when the client sends a message we push the
  // optimistic id + text onto this FIFO. The next matching durable user-row
  // consumes the head entry and is re-emitted with that id (preventing a
  // duplicate bubble). A queue rather than a single slot so two rapid sends
  // don't lose the first rendezvous when the gateway echo lags ~6s behind.
  pendingUserEchoes: { optimisticId: string; text: string }[]
}

const MAX_PENDING_USER_ECHOES = 16

const sessions = new Map<string, SessionRecord>() // key: `${workspaceId}:${sessionId}`
const openclawAgents = new Map<
  string,
  { processing: boolean; sessionKey: string; activeRunId: string | null }
>()

// On gateway reconnect, the gateway module replays subscriptions but durable
// rows that landed during the disconnect aren't re-pushed. Reconcile every
// known session against the canonical `sessions.get` transcript. Idempotent.
onGatewayReconnected(async () => {
  for (const rec of sessions.values()) {
    try {
      await reconcileAfterRun(rec)
    } catch (err) {
      console.error('[openclaw-session] reconcile-on-reconnect failed', err)
    }
  }
  // Lifecycle frames emitted during the disconnect window are gone for good —
  // a run that ended while we were away would leave its session busy forever.
  // Re-derive every busy flag from the gateway's own `sessions.list` status.
  try {
    const busy = [...sessions.values()].filter(rec =>
      isOpenClawProcessing(rec.workspaceId, rec.sessionId)
    )
    if (busy.length === 0) return
    const gw = await getGateway()
    const res = await gw.rpc<{ sessions: { key: string; status?: string }[] }>('sessions.list', {
      includeGlobal: true
    })
    const running = new Set(
      (res?.sessions ?? []).filter(row => row.status === 'running').map(row => row.key)
    )
    for (const rec of busy) {
      if (!running.has(rec.sessionKey)) setProcessing(rec, false, null)
    }
  } catch (err) {
    console.error('[openclaw-session] busy-flag reconcile failed', err)
  }
})

function recKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

// All non-idle OpenClaw sessions across every workspace, for the status
// snapshot. Key is `${workspaceId}:${sessionId}` (both are colon-free). The
// protocol has no "waiting for user input" concept, so activity is binary.
export function getOpenClawActiveSessions(): {
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}[] {
  const out: { workspaceId: string; sessionId: string; activity: SessionActivity }[] = []
  for (const [k, v] of openclawAgents) {
    if (!v.processing) continue
    const i = k.indexOf(':')
    out.push({ workspaceId: k.slice(0, i), sessionId: k.slice(i + 1), activity: 'running' })
  }
  return out
}

export function isOpenClawProcessing(workspaceId: string, sessionId: string): boolean {
  return openclawAgents.get(recKey(workspaceId, sessionId))?.processing === true
}

function setProcessing(rec: SessionRecord, processing: boolean, runId: string | null) {
  rec.activeRunId = runId
  const existing = openclawAgents.get(recKey(rec.workspaceId, rec.sessionId))
  openclawAgents.set(recKey(rec.workspaceId, rec.sessionId), {
    processing,
    sessionKey: rec.sessionKey,
    activeRunId: runId
  })
  if (existing?.processing === processing) return
  broadcast(rec.workspaceId, {
    type: 'status',
    sessionId: rec.sessionId,
    activity: processing ? 'running' : 'idle'
  })
  if (processing) {
    void markViewBuilderBuildingBySession(rec.workspaceId, rec.workspacePath, rec.sessionId)
  } else {
    void markViewBuilderWaitingBySession(rec.workspaceId, rec.workspacePath, rec.sessionId)
  }
}

// On run end the gateway has flushed every durable row — including
// `toolResult` messages, which the live `session.message` stream does NOT
// emit (verified empirically). Pull a fresh transcript and merge any new
// toolResult rows so our tool-call cards flip from `pending` to
// `success`/`error` with output. Idempotent.
async function reconcileAfterRun(rec: SessionRecord): Promise<void> {
  const detail = await getOpenClawSessionMessages(rec.sessionId, rec.workspacePath, rec.agentId)
  if (!detail?.messages) return
  const owners = new Set<OpenClawMessage>()
  for (const msg of detail.messages) {
    const result = toolResultFromMessage(msg)
    if (result) {
      const existing = rec.results.get(result.id)
      if (
        !existing ||
        existing.output !== result.info.output ||
        existing.isError !== result.info.isError
      ) {
        rec.results.set(result.id, result.info)
        for (const o of findToolCallOwners(rec.messagesById.values(), result.id)) {
          owners.add(o)
        }
      }
      continue
    }
    if (msg.role !== 'user' && msg.role !== 'assistant') continue
    const id = msg.__openclaw?.id
    if (typeof id !== 'string') continue
    if (!rec.messagesById.has(id)) {
      rec.messagesById.set(id, msg)
      owners.add(msg)
    }
  }
  if (owners.size === 0) return
  let idx = 0
  for (const m of rec.messagesById.values()) {
    if (owners.has(m)) emitTurn(rec, m, idx)
    idx++
  }
}

// Re-derive the view from the current messages + results map. Cheaper than
// it sounds because we keep the materialized `view` and re-build only when
// a tool-result update forces a re-emit.
function rebuildView(rec: SessionRecord): void {
  let view: ViewState = emptyViewState()
  let i = 0
  for (const msg of rec.messagesById.values()) {
    const turn = messageToTurn(msg, rec.sessionKey, i++, rec.results)
    if (turn) view = applyEvent(view, { kind: 'turn', turn })
  }
  rec.view = view
}

function emitTurn(rec: SessionRecord, msg: OpenClawMessage, idx: number): void {
  const turn = messageToTurn(msg, rec.sessionKey, idx, rec.results)
  if (!turn) return
  // Optimistic-id rendezvous: if this is the first user-text turn that
  // matches what the client just sent, re-id it to the optimistic id so the
  // optimistic bubble upserts in place instead of duplicating.
  if (rec.pendingUserEchoes.length > 0 && turn.role === 'user') {
    const text = turn.parts.find(p => p.type === 'text')?.text?.trim()
    if (text !== undefined) {
      const idx = rec.pendingUserEchoes.findIndex(e => e.text.trim() === text)
      if (idx >= 0) {
        turn.id = rec.pendingUserEchoes[idx].optimisticId
        rec.pendingUserEchoes.splice(idx, 1)
      }
    }
  }
  rec.view = applyEvent(rec.view, { kind: 'turn', turn })
  broadcast(rec.workspaceId, { kind: 'turn', turn, sessionId: rec.sessionId })
}

function ingest(rec: SessionRecord, msg: OpenClawMessage): void {
  // toolResult: update the results map and re-emit each owner turn so the
  // tool-call card gets `state: 'success'/'error'` + output folded in.
  const result = toolResultFromMessage(msg)
  if (result) {
    rec.results.set(result.id, result.info)
    const owners = findToolCallOwners(rec.messagesById.values(), result.id)
    const i = 0
    const ownerSet = new Set(owners)
    let idx = 0
    for (const m of rec.messagesById.values()) {
      if (ownerSet.has(m)) emitTurn(rec, m, idx)
      idx++
    }
    void i
    return
  }

  if (msg.role !== 'user' && msg.role !== 'assistant') return
  // Skip the gateway's transient pre-envelope echo — those frames lack
  // `__openclaw.id`. The durable row arrives ~6s later with id + envelope.
  const id = msg.__openclaw?.id
  if (typeof id !== 'string') return
  const wasUpdate = rec.messagesById.has(id)
  rec.messagesById.set(id, msg)
  // Compute idx as insertion order — for an update use the existing position,
  // for a new message it's the last slot.
  let idx = 0
  for (const k of rec.messagesById.keys()) {
    if (k === id) break
    idx++
  }
  void wasUpdate
  emitTurn(rec, msg, idx)
}

async function seed(rec: SessionRecord): Promise<void> {
  const detail: OpenClawSessionDetail | null = await getOpenClawSessionMessages(
    rec.sessionId,
    rec.workspacePath,
    rec.agentId
  )
  if (detail?.messages) {
    for (const msg of detail.messages) {
      // Apply the same toolResult/role gating as live ingest for consistency.
      const result = toolResultFromMessage(msg)
      if (result) {
        rec.results.set(result.id, result.info)
        continue
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') continue
      const id = msg.__openclaw?.id
      if (typeof id !== 'string') continue
      rec.messagesById.set(id, msg)
    }
    rebuildView(rec)
  }
  rec.seeded = true
  // Drain any frames that arrived during seed.
  const queued = rec.pendingFrames
  rec.pendingFrames = []
  for (const m of queued) ingest(rec, m)
}

async function ensureSubscribed(rec: SessionRecord): Promise<void> {
  if (rec.ingestUnsubscribe) return
  const gw = await getGateway()
  await gw.ensureTopLevelSubscribed()
  await gw.ensureSessionSubscribed(rec.sessionKey)

  rec.ingestUnsubscribe = gw.on((event, payload) => {
    // All live frames must wait for seed — `sessions.changed phase:'start'`
    // arriving before `messagesById` is populated would otherwise trigger
    // `reconcileAfterRun` against an empty map (it would emit no owners but
    // still pull the full transcript over RPC). Cleaner to gate everything.
    if (!rec.seeded && event !== 'session.message') return
    if (event === 'session.message') {
      if (payload.sessionKey !== rec.sessionKey) return
      const message = payload.message as OpenClawMessage | undefined
      if (!message) return
      if (!rec.seeded) {
        rec.pendingFrames.push(message)
        return
      }
      ingest(rec, message)
    } else if (event === 'sessions.changed') {
      if (payload.sessionKey !== rec.sessionKey) return
      const phase = payload.phase as string | undefined
      const runId = payload.runId as string | undefined
      if (phase === 'start' && runId) {
        setProcessing(rec, true, runId)
      } else if ((phase === 'end' || phase === 'error') && runId) {
        if (rec.activeRunId === runId) {
          setProcessing(rec, false, null)
          // Pick up any toolResult rows the live stream did not push.
          reconcileAfterRun(rec).catch(err =>
            console.error('[openclaw-session] reconcile failed', err)
          )
        }
      }
    } else if (event === 'agent') {
      // Backstop for run lifecycle — `sessions.changed` should already cover
      // this, but `agent` lifecycle frames are the authoritative signal.
      if (payload.sessionKey !== rec.sessionKey) return
      const stream = payload.stream as string | undefined
      if (stream !== 'lifecycle') return
      const runId = payload.runId as string | undefined
      const data = payload.data as { phase?: string } | undefined
      const phase = data?.phase
      if (phase === 'start' && runId) setProcessing(rec, true, runId)
      else if ((phase === 'end' || phase === 'error') && runId) {
        if (rec.activeRunId === runId) {
          setProcessing(rec, false, null)
          reconcileAfterRun(rec).catch(err =>
            console.error('[openclaw-session] reconcile failed', err)
          )
        }
      }
    }
  })
}

export async function getOrCreateOpenClawSession(input: {
  workspaceId: string
  workspacePath: string
  agentId: string
  sessionId: string
}): Promise<SessionRecord> {
  const k = recKey(input.workspaceId, input.sessionId)
  let rec = sessions.get(k)
  if (rec) return rec

  // We use the gateway's session key. For OpenClaw the public API takes a
  // sessionId, but RPCs need the composite key. `sessions.resolve` does that
  // mapping; cache it on the record.
  const gw = await getGateway()
  const resolved = await gw
    .rpc<{ key?: string }>('sessions.resolve', {
      sessionId: input.sessionId,
      agentId: input.agentId
    })
    .catch(() => null)
  const sessionKey = resolved?.key
  if (!sessionKey) throw new Error(`unable to resolve session ${input.sessionId}`)

  rec = {
    ...input,
    sessionKey,
    messagesById: new Map(),
    results: new Map(),
    view: emptyViewState(),
    activeRunId: null,
    seeded: false,
    pendingFrames: [],
    pendingUserEchoes: []
  }
  sessions.set(k, rec)
  await ensureSubscribed(rec)
  await seed(rec)
  return rec
}

// Cold-load helper for the REST events endpoint. If we already have a live
// session, return its current view materialized as StreamEvents (so it stays
// in sync with WS deltas the client will receive moments later). Otherwise
// fall back to the static `getOpenClawSessionMessages → toStreamEvents` path
// without spinning up a live subscription (subscription is only created when
// chat is sent or the live session is explicitly requested).
export function viewAsEvents(rec: SessionRecord): StreamEvent[] {
  const evs: StreamEvent[] = []
  for (const turn of rec.view.turns) evs.push({ kind: 'turn', turn })
  if (rec.view.snapshot) evs.unshift({ kind: 'snapshot', snapshot: rec.view.snapshot })
  for (const notice of rec.view.notices) evs.push({ kind: 'notice', notice })
  if (rec.view.result) evs.push({ kind: 'result', result: rec.view.result })
  return evs
}

export async function sendOpenClawMessage(input: {
  workspaceId: string
  workspacePath: string
  agentId: string
  sessionId: string
  isNew: boolean
  content: string
  // Upload ids. Basic support: the gateway's `sessions.send` only takes a string
  // message, so we materialize each upload to a temp file and append the paths
  // for the agent to read. Rich vision blocks await a gateway content-block API
  // (see dev/file-uploads.md).
  attachments?: string[]
  optimisticId?: string
}): Promise<void> {
  // Fold any attachments into the message text as file-path references.
  let content = input.content
  if (input.attachments?.length) {
    const uploads = resolveUploads(input.workspaceId, input.attachments)
    const files: { filename: string; path: string }[] = []
    for (const u of uploads) {
      const p = await materializeToPath(u)
      if (p) files.push({ filename: u.filename, path: p })
    }
    content = appendAttachmentNote(input.content, files)
  }
  // Attachment-only send whose ids all expired → nothing to say; don't open a
  // session for an empty message.
  if (!content) return
  return sendOpenClawMessageImpl({ ...input, content })
}

async function sendOpenClawMessageImpl(input: {
  workspaceId: string
  workspacePath: string
  agentId: string
  sessionId: string
  isNew: boolean
  content: string
  optimisticId?: string
}): Promise<void> {
  // New threads: ask the gateway to create one, then rename the client's
  // tentative UUID to the real session id. Mirrors the Claude Code flow
  // where the SDK echoes back a real `session_id` on first turn.
  let realSessionId = input.sessionId
  let rec: SessionRecord
  try {
    if (input.isNew) {
      const gw = await getGateway()
      const created = await gw.rpc<{ key?: string; sessionId?: string }>('sessions.create', {
        agentId: input.agentId
      })
      if (created?.sessionId && created.sessionId !== input.sessionId) {
        broadcast(input.workspaceId, {
          type: 'session_renamed',
          from: input.sessionId,
          to: created.sessionId
        })
        realSessionId = created.sessionId
        await renameViewBuilderSession(
          input.workspaceId,
          input.workspacePath,
          input.sessionId,
          realSessionId
        )
      }
    }
    rec = await getOrCreateOpenClawSession({
      workspaceId: input.workspaceId,
      workspacePath: input.workspacePath,
      agentId: input.agentId,
      sessionId: realSessionId
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to start session'
    broadcast(input.workspaceId, {
      kind: 'error',
      sessionId: realSessionId,
      content: message
    })
    await markViewBuilderWaitingBySession(
      input.workspaceId,
      input.workspacePath,
      realSessionId,
      message
    )
    throw err
  }

  if (input.optimisticId) {
    rec.pendingUserEchoes.push({
      optimisticId: input.optimisticId,
      text: stripViewBuilderMeta(input.content)
    })
    if (rec.pendingUserEchoes.length > MAX_PENDING_USER_ECHOES) {
      rec.pendingUserEchoes.shift()
    }
  }
  // Flip processing immediately — the run starts within ~100ms of `sessions.send`
  // resolving, but we don't want the UI's send button to flicker.
  setProcessing(rec, true, rec.activeRunId)

  try {
    const gw = await getGateway()
    const resp = await gw.rpc<{ runId?: string; status?: string }>('sessions.send', {
      key: rec.sessionKey,
      message: input.content
    })
    if (resp?.runId) setProcessing(rec, true, resp.runId)
  } catch (err) {
    setProcessing(rec, false, null)
    if (input.optimisticId) {
      const idx = rec.pendingUserEchoes.findIndex(e => e.optimisticId === input.optimisticId)
      if (idx >= 0) rec.pendingUserEchoes.splice(idx, 1)
    }
    const message = err instanceof Error ? err.message : 'send failed'
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: message
    })
    await markViewBuilderWaitingBySession(
      rec.workspaceId,
      rec.workspacePath,
      rec.sessionId,
      message
    )
    throw err
  }
}

export async function abortOpenClawRun(input: {
  workspaceId: string
  sessionId: string
}): Promise<void> {
  const rec = sessions.get(recKey(input.workspaceId, input.sessionId))
  if (!rec) return
  try {
    const gw = await getGateway()
    await gw.rpc('sessions.abort', {
      key: rec.sessionKey,
      ...(rec.activeRunId ? { runId: rec.activeRunId } : {})
    })
    broadcast(rec.workspaceId, { kind: 'stopped', sessionId: rec.sessionId })
    setProcessing(rec, false, null)
  } catch (err) {
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'abort failed'
    })
    // Stop is the user's escape hatch from a stuck spinner — clear the busy
    // flag even when the abort RPC fails (the run may already be gone).
    setProcessing(rec, false, null)
  }
}

// Read-side hook for the REST events endpoint. If a live session exists we
// return its current materialized view so it agrees with the WS deltas the
// client will start receiving on its next message. If no live session has
// been created yet, return null and let the caller use the static path.
export function getLiveOpenClawEvents(
  workspaceId: string,
  sessionId: string
): StreamEvent[] | null {
  const rec = sessions.get(recKey(workspaceId, sessionId))
  if (!rec || !rec.seeded) return null
  return viewAsEvents(rec)
}

// Lazily ensure a session is live before serving its events. Used by the
// REST endpoint to make subsequent WS frames upsert into the same view.
export async function ensureOpenClawSessionLive(input: {
  workspaceId: string
  workspacePath: string
  agentId: string
  sessionId: string
}): Promise<StreamEvent[]> {
  const rec = await getOrCreateOpenClawSession(input)
  return viewAsEvents(rec)
}
