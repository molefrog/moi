// Per-(workspaceId, sessionId) live OpenClaw session adapter.
//
// Owns the durable in-memory view for a session and converts each
// `session.message` frame into our `StreamEvent`s. One instance is created
// the first time the workspace's UI asks for its events (via the REST
// endpoint) or sends a chat into it; thereafter it stays subscribed so the
// view is up to date for reattach without re-fetching `sessions.get`.
//
// Live layers on top of the durable rows (all verified against gateways
// 2026.7.1 and 2026.6.33 — same wire shapes on both):
//   - `chat` frames (state delta/final/error, cumulative partial message) →
//     StreamPreview broadcasts; cleared by the client when the durable turn
//     lands carrying the matching `meta.apiMessageId`.
//   - `session.tool` frames (phase start/update/result with full output) →
//     tool cards flip pending→running→success/error mid-run;
//     `reconcileAfterRun` remains the safety net for anything missed.
//   - Disk persistence stays out — the gateway is the source of truth; we
//     re-seed from `sessions.get` on cold start.
import { appendAttachmentNote } from '@/lib/attachment-note'
import { type MoiContext, appendMoiContext, renderMoiContext } from '@/lib/moi-context'
import { type PreviewBlock, applyEvent, emptyViewState } from '@/lib/format'
import type { SessionActivity, StreamEvent, ViewState } from '@/lib/types'

import { messageIdempotencyKey } from './compat'

import {
  type OpenClawMessage,
  type OpenClawSessionDetail,
  getOpenClawSessionMessages
} from './discovery'
import { renameSelectedSession } from '../../selected-session'
import {
  type ToolResultInfo,
  findToolCallOwners,
  flattenToolResultContent,
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
  // optimistic id + text onto this FIFO. The durable user-row is matched by
  // its idempotency key (`<runId>:user`, exact) when the send's runId is
  // known, else by text. A queue rather than a single slot so two rapid sends
  // don't lose the first rendezvous when the gateway echo lags behind.
  pendingUserEchoes: { optimisticId: string; text: string; runId?: string }[]
  // Whether the client asked for token previews on the latest send.
  streamEnabled: boolean
  // Last model/thinking applied via sessions.patch, in `provider/model` form —
  // avoids a patch round-trip per send when nothing changed.
  appliedModel?: string
  appliedThinking?: string
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
        // A live `session.tool` start whose result frame was lost (disconnect)
        // must be finalized even when the durable output is identical-empty —
        // otherwise the card spins forever.
        existing.running ||
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

// The preview slot for a run. Doubles as `meta.apiMessageId` on the run's
// committed assistant turns so the client's native preview reconciliation
// clears the live text the instant the durable turn lands.
function previewMessageId(sessionKey: string, runId: string): string {
  return `openclaw:${sessionKey}:${runId}`
}

function emitTurn(rec: SessionRecord, msg: OpenClawMessage, idx: number): void {
  const turn = messageToTurn(msg, rec.sessionKey, idx, rec.results)
  if (!turn) return
  // Optimistic-id rendezvous: prefer the exact idempotency-key match
  // (`<runId>:user`; nested under `__openclaw` on 2026.7.x, message-level on
  // 2026.6.x), fall back to first-matching-text for old rows and unknown
  // runIds. Re-id to the optimistic id so the optimistic bubble upserts in
  // place instead of duplicating.
  if (rec.pendingUserEchoes.length > 0 && turn.role === 'user') {
    const idem = messageIdempotencyKey(msg)
    let at = idem ? rec.pendingUserEchoes.findIndex(e => e.runId && `${e.runId}:user` === idem) : -1
    if (at < 0) {
      const text = turn.parts.find(p => p.type === 'text')?.text?.trim()
      if (text !== undefined) {
        at = rec.pendingUserEchoes.findIndex(e => e.text.trim() === text)
      }
    }
    if (at >= 0) {
      turn.id = rec.pendingUserEchoes[at].optimisticId
      rec.pendingUserEchoes.splice(at, 1)
    }
  }
  // Stamp the run's preview slot id so the client clears the streaming
  // preview when this turn upserts (chat deltas can trail the durable row).
  // Only FRESH turns get the current run's slot — a re-emitted older turn
  // (tool-result fold-in, reconcile) keeps whatever it was stamped with, so
  // it can never clear a newer run's live preview.
  if (turn.role === 'assistant') {
    const prior = rec.view.turns.find(t => t.id === turn.id)
    if (prior) {
      const kept = prior.meta?.apiMessageId
      if (kept) turn.meta = { ...turn.meta, apiMessageId: kept }
    } else if (rec.activeRunId) {
      turn.meta = { ...turn.meta, apiMessageId: previewMessageId(rec.sessionKey, rec.activeRunId) }
    }
  }
  rec.view = applyEvent(rec.view, { kind: 'turn', turn })
  broadcast(rec.workspaceId, { kind: 'turn', turn, sessionId: rec.sessionId })
}

// Re-emit every assistant turn that references `toolCallId` so its tool card
// reflects the latest entry in `rec.results`.
function reemitToolCallOwners(rec: SessionRecord, toolCallId: string): void {
  const owners = findToolCallOwners(rec.messagesById.values(), toolCallId)
  const ownerSet = new Set(owners)
  let idx = 0
  for (const m of rec.messagesById.values()) {
    if (ownerSet.has(m)) emitTurn(rec, m, idx)
    idx++
  }
}

// `chat` delta frames carry the full in-progress assistant message; map its
// content blocks onto cumulative PreviewBlocks (text + thinking only — tool
// calls surface through `session.tool`, not the preview). Exported for tests.
export function chatPreviewBlocks(content: unknown): PreviewBlock[] {
  if (typeof content === 'string') {
    return content ? [{ index: 0, kind: 'text', text: content }] : []
  }
  if (!Array.isArray(content)) return []
  const blocks: PreviewBlock[] = []
  content.forEach((block, index) => {
    if (!block || typeof block !== 'object') return
    const b = block as { type?: unknown; text?: unknown; thinking?: unknown }
    if (b.type === 'text' && typeof b.text === 'string' && b.text) {
      blocks.push({ index, kind: 'text', text: b.text })
    } else if (b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking) {
      blocks.push({ index, kind: 'reasoning', text: b.thinking })
    }
  })
  return blocks
}

function handleChatFrame(rec: SessionRecord, payload: Record<string, unknown>): void {
  if (!rec.streamEnabled) return
  const runId = typeof payload.runId === 'string' ? payload.runId : rec.activeRunId
  if (!runId) return
  const messageId = previewMessageId(rec.sessionKey, runId)
  const state = payload.state
  if (state === 'delta') {
    const message = payload.message as { content?: unknown } | undefined
    const blocks = chatPreviewBlocks(message?.content)
    if (blocks.length === 0) return
    broadcast(rec.workspaceId, {
      type: 'preview',
      sessionId: rec.sessionId,
      messageId,
      parentToolUseId: null,
      blocks
    })
  } else if (state === 'final' || state === 'error' || state === 'aborted') {
    // Belt-and-braces clear: the durable turn's apiMessageId already clears
    // the slot, but a trailing delta after the durable row would repaint it.
    // 'aborted' arrives when a steer/abort interrupts the run mid-stream —
    // without the clear the dead preview would linger (verified live).
    broadcast(rec.workspaceId, {
      type: 'preview',
      sessionId: rec.sessionId,
      messageId,
      parentToolUseId: null,
      blocks: []
    })
  }
}

// `session.tool` frames flip tool cards live: start/update → running,
// result → success/error with the full output (both gateway lines emit the
// output inline; `reconcileAfterRun` stays as the safety net).
function handleToolFrame(rec: SessionRecord, payload: Record<string, unknown>): void {
  const data = payload.data as
    | { phase?: unknown; name?: unknown; toolCallId?: unknown; isError?: unknown; result?: unknown }
    | undefined
  if (!data || typeof data.toolCallId !== 'string') return
  const id = data.toolCallId
  const toolName = typeof data.name === 'string' ? { toolName: data.name } : {}
  if (data.phase === 'start' || data.phase === 'update') {
    const existing = rec.results.get(id)
    if (existing && !existing.running) return // final result already landed
    rec.results.set(id, { output: '', isError: false, running: true, ...toolName })
  } else if (data.phase === 'result') {
    const result = data.result as { content?: unknown } | undefined
    rec.results.set(id, {
      output: flattenToolResultContent((result?.content ?? '') as OpenClawMessage['content']),
      isError: data.isError === true,
      ...toolName
    })
  } else {
    return
  }
  reemitToolCallOwners(rec, id)
}

// Debounced workspace session-list refresh — `sessions.changed` fires for
// every session under the agent (cron spawns, subagents, patches), and
// several records can hold subscriptions for the same workspace. `send` is in
// the set because 2026.6.x never emits `chat.title` — the post-send refresh
// is what keeps titles/previews fresh there. A trailing flush covers bursts
// (create immediately followed by the title patch) that a leading-edge-only
// throttle would drop.
const lastListRefresh = new Map<string, { at: number; trailing?: ReturnType<typeof setTimeout> }>()
const LIST_REFRESH_MIN_MS = 400
const LIST_REFRESH_REASONS = new Set([
  'chat.title',
  'create',
  'delete',
  'patch',
  'label',
  'compact',
  'send',
  'steer',
  'subagent-status'
])
function broadcastSessionsChanged(rec: SessionRecord): void {
  const now = Date.now()
  const entry = lastListRefresh.get(rec.workspaceId)
  if (entry && now - entry.at < LIST_REFRESH_MIN_MS) {
    if (!entry.trailing) {
      entry.trailing = setTimeout(
        () => {
          lastListRefresh.set(rec.workspaceId, { at: Date.now() })
          broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
        },
        LIST_REFRESH_MIN_MS - (now - entry.at)
      )
    }
    return
  }
  if (entry?.trailing) clearTimeout(entry.trailing)
  lastListRefresh.set(rec.workspaceId, { at: now })
  broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
}

function ingest(rec: SessionRecord, msg: OpenClawMessage): void {
  // toolResult: update the results map and re-emit each owner turn so the
  // tool-call card gets `state: 'success'/'error'` + output folded in.
  const result = toolResultFromMessage(msg)
  if (result) {
    rec.results.set(result.id, result.info)
    reemitToolCallOwners(rec, result.id)
    return
  }

  if (msg.role !== 'user' && msg.role !== 'assistant') return
  // Skip the gateway's transient pre-envelope echo — those frames lack
  // `__openclaw.id`. The durable row arrives ~6s later with id + envelope.
  const id = msg.__openclaw?.id
  if (typeof id !== 'string') return
  // A durable assistant row on a different model than the previous one marks
  // a mid-session model switch (sessions.patch here or anywhere else) —
  // surface it as a notice instead of letting it pass silently.
  if (msg.role === 'assistant') {
    const model = (msg as { model?: unknown }).model
    if (typeof model === 'string') {
      let prev: string | undefined
      for (const m of rec.messagesById.values()) {
        if (m.role !== 'assistant') continue
        const pm = (m as { model?: unknown }).model
        if (typeof pm === 'string') prev = pm
      }
      if (prev !== undefined && prev !== model) {
        const notice = {
          id: `openclaw:model-change:${id}`,
          kind: 'model-change' as const,
          // The switching turn's own timestamp, so live and cold placement
          // agree (the client sorts equal-time notices before the turn).
          at:
            typeof msg.timestamp === 'number'
              ? new Date(msg.timestamp).toISOString()
              : new Date().toISOString(),
          model,
          prev
        }
        // Fold into the view too — the REST events replay must agree with
        // the WS frames the client already saw.
        rec.view = applyEvent(rec.view, { kind: 'notice', notice })
        broadcast(rec.workspaceId, { kind: 'notice', sessionId: rec.sessionId, notice })
      }
    }
  }
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
    } else if (event === 'chat') {
      if (payload.sessionKey !== rec.sessionKey) return
      handleChatFrame(rec, payload)
    } else if (event === 'session.tool') {
      if (payload.sessionKey !== rec.sessionKey) return
      handleToolFrame(rec, payload)
    } else if (event === 'sessions.changed') {
      // List refreshes apply to ANY session of the workspace's agent — cron
      // spawns, subagents, titles, patches. (2026.6.x never emits
      // `chat.title`; the other reasons cover title refreshes there.)
      const reason = typeof payload.reason === 'string' ? payload.reason : undefined
      if (reason && LIST_REFRESH_REASONS.has(reason)) broadcastSessionsChanged(rec)
      if (payload.sessionKey !== rec.sessionKey) return
      if (reason === 'compact') {
        const notice = {
          id: `openclaw:compact:${typeof payload.ts === 'number' ? payload.ts : Date.now()}`,
          kind: 'compact' as const,
          at: new Date().toISOString()
        }
        rec.view = applyEvent(rec.view, { kind: 'notice', notice })
        broadcast(rec.workspaceId, { kind: 'notice', sessionId: rec.sessionId, notice })
      }
      // Frames embed the fresh session row — keep the applied-model cache
      // truthful even when the session is patched outside moi.
      const row = payload.session as
        | { model?: unknown; modelProvider?: unknown; thinkingLevel?: unknown }
        | undefined
      if (row && typeof row.model === 'string' && typeof row.modelProvider === 'string') {
        rec.appliedModel = `${row.modelProvider}/${row.model}`
      }
      if (row && typeof row.thinkingLevel === 'string') rec.appliedThinking = row.thinkingLevel
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
    streamEnabled: true,
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
  // Picker selections, applied to the gateway session via `sessions.patch`
  // before the send (see applySessionSettings).
  model?: string
  effort?: string
  // Client's live-typing toggle; previews are only broadcast when on.
  stream?: boolean
  // Structured moi context (lib/moi-context.ts), rendered and appended at
  // the gateway send only — `content` stays clean so the optimistic-id echo
  // rendezvous keeps matching on the user's text.
  context?: MoiContext
}): Promise<void> {
  // Fold any attachments into the message text as file-path references.
  const uploads = input.attachments?.length
    ? resolveUploads(input.workspaceId, input.attachments)
    : []
  let content = input.content
  if (uploads.length > 0) {
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

// Apply the picker's model/effort onto the gateway session before the send.
// `sessions.patch {model, thinkingLevel}` exists on both supported lines
// (verified live on 2026.7.1 and 2026.6.33); values come from `models.list`
// ids and the thinking-level menu, so a rejection means the gateway's
// allowlist disagrees — surfaced to the chat, not swallowed.
async function applySessionSettings(
  rec: SessionRecord,
  model: string | undefined,
  effort: string | undefined
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (model && model !== rec.appliedModel) patch.model = model
  if (effort && effort !== rec.appliedThinking) patch.thinkingLevel = effort
  if (Object.keys(patch).length === 0) return
  const gw = await getGateway()
  try {
    await gw.rpc('sessions.patch', { key: rec.sessionKey, ...patch })
  } catch (err) {
    // The effort menu is a static superset (compat.ts) — a gateway/model can
    // reject a level. Degrade to the model-only patch instead of blocking the
    // send; a rejected MODEL still throws (running on the wrong model is
    // worse than not sending).
    if (typeof patch.thinkingLevel === 'string' && typeof patch.model === 'string') {
      console.warn('[openclaw-session] thinkingLevel patch rejected, retrying model-only', err)
      await gw.rpc('sessions.patch', { key: rec.sessionKey, model: patch.model })
      rec.appliedModel = patch.model
      return
    }
    if (typeof patch.thinkingLevel === 'string' && !patch.model) {
      console.warn('[openclaw-session] thinkingLevel patch rejected, sending anyway', err)
      return
    }
    throw err
  }
  if (typeof patch.model === 'string') rec.appliedModel = patch.model
  if (typeof patch.thinkingLevel === 'string') rec.appliedThinking = patch.thinkingLevel
}

async function sendOpenClawMessageImpl(input: {
  workspaceId: string
  workspacePath: string
  agentId: string
  sessionId: string
  isNew: boolean
  content: string
  optimisticId?: string
  model?: string
  effort?: string
  stream?: boolean
  context?: MoiContext
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
        realSessionId = created.sessionId
        await renameSelectedSession(input.workspacePath, input.sessionId, realSessionId)
        await renameViewBuilderSession(
          input.workspaceId,
          input.workspacePath,
          input.sessionId,
          realSessionId
        )
        broadcast(input.workspaceId, {
          type: 'session_renamed',
          from: input.sessionId,
          to: realSessionId
        })
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

  rec.streamEnabled = input.stream !== false

  const echo: { optimisticId: string; text: string; runId?: string } | null = input.optimisticId
    ? { optimisticId: input.optimisticId, text: input.content }
    : null
  if (echo) {
    rec.pendingUserEchoes.push(echo)
    if (rec.pendingUserEchoes.length > MAX_PENDING_USER_ECHOES) {
      rec.pendingUserEchoes.shift()
    }
  }
  // Flip processing immediately — the run starts within ~100ms of `sessions.send`
  // resolving, but we don't want the UI's send button to flicker.
  setProcessing(rec, true, rec.activeRunId)

  try {
    await applySessionSettings(rec, input.model, input.effort)
    const gw = await getGateway()
    const resp = await gw.rpc<{ runId?: string; status?: string }>('sessions.send', {
      key: rec.sessionKey,
      message: input.context
        ? appendMoiContext(input.content, renderMoiContext(input.context))
        : input.content
    })
    if (resp?.runId) {
      setProcessing(rec, true, resp.runId)
      // The durable user echo carries `<runId>:user` — arm the exact match.
      if (echo) echo.runId = resp.runId
    }
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
