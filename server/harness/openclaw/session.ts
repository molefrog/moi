// Per-(workspaceId, sessionId) live OpenClaw session.
//
// Holds the in-memory view for one session and keeps it current from the
// gateway's event stream: `session.message` rows build the turns, `chat` frames
// drive the streaming preview, tool frames drive the tool cards, and the
// run-end reconcile against `sessions.get` catches anything the wire dropped.
// The gateway is the source of truth — nothing is persisted here, so a cold
// open just re-seeds.
//
// The frame families and the order they arrive in are documented in NOTES.md
// §6; the rules that follow from it (who owns a tool card, why identity is
// decided once) are worth reading before changing anything here.
import { appendAttachmentNote } from '@/lib/attachment-note'
import {
  type MoiContext,
  appendMoiContext,
  renderMoiContext,
  stripMoiContext
} from '@/lib/moi-context'
import {
  type PreviewBlock,
  type ToolCall,
  type ToolState,
  type Turn,
  applyEvent,
  emptyViewState
} from '@/lib/format'
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
import {
  currentGatewayHandle,
  getGateway,
  onGatewayReconnected,
  releaseSessionSubscriptionRef
} from './gateway'
import { recordOpenClawThinkingProfile, recordOpenClawThinkingRejection } from './thinking'
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
  // Which frame family owns the current run's streaming preview. The first of
  // `chat` / `agent` to emit a delta claims the run so a gateway emitting both
  // doesn't double-broadcast (see claimPreviewSource).
  previewRunId?: string
  previewSource?: 'chat' | 'agent'
  // Streaming reasoning for the current run, and the last text blocks painted
  // with it. The `chat`/`agent` arbitration above decides who owns the TEXT,
  // but reasoning is not a duplicate of that text — on claude-cli it arrives on
  // its own `agent`/thinking stream while `chat` owns the text — so it bypasses
  // the claim and is merged into the same preview here instead. Both are
  // per-run and cleared when the run terminalizes.
  previewReasoning?: { runId: string; text: string }
  previewTextBlocks?: { runId: string; blocks: PreviewBlock[] }
  // Calls rendered as their own turn because no durable row owned them when the
  // tool started, keyed by toolCallId. Permanent for the session: durable rows
  // suppress these ids (adapter `omitToolCallIds`) so a row that later grows the
  // matching block can't render the call twice. A broadcast turn can never be
  // retracted, so ownership is decided once and then respected.
  liveTools: Map<string, { name: string; input: unknown; seq: number }>
  // Live reasoning spans from `agent`/item frames of kind `analysis`, keyed by
  // itemId. Timing only — those frames carry no reasoning text (see
  // handleReasoningItemFrame).
  liveThinking: Map<string, { startedAt: number; endedAt?: number; seq?: number }>
  // Highest `__openclaw.seq` ingested, and a monotonic tick for the synthetic
  // turns that hang off it. Together they place a live card between the
  // durable row that preceded it and the one that follows (see liveTurnSeq).
  lastDurableSeq: number
  liveTurnTick: number
  // The model ref we last asked the gateway for, and the `provider/model` the
  // last row reported. They differ only when something outside moi moved the
  // session, which is the whole point of keeping both.
  requestedModel?: string
  wireModel?: string
  appliedThinking?: string
  // Last `reasoningLevel` applied. The gateway defaults this to `off`, which
  // suppresses reasoning output entirely on providers that would emit it.
  appliedReasoning?: string
  // Model of the most recent assistant row seen (seed scan + live ingest). Lets
  // ingest detect a mid-session model switch without re-scanning the whole
  // messagesById map each frame; the model-change notice reads its `prev` here.
  lastAssistantModel?: string
  // Idle-eviction timer, armed when the session goes idle and cleared when it
  // goes busy or is torn down. OpenClaw holds only WS listeners (no subprocess),
  // so eviction just drops the record and releases the subscription.
  idleTimer?: ReturnType<typeof setTimeout> | null
  // In-flight reconcile, so the two run-end signals (sessions.changed + agent
  // lifecycle) coalesce onto one transcript fetch instead of racing two.
  reconcilePromise?: Promise<void>
  // The run whose failure we already told the user about. A dying run reports
  // itself on several frames with several wordings; the first with text wins
  // and the rest are echoes (see reportRunError).
  reportedErrorRunId?: string
}

const MAX_PENDING_USER_ECHOES = 16

// OpenClaw sessions hold only WebSocket listeners — no subprocess, unlike Claude
// Code — so eviction is cheap to redo and a looser TTL avoids churning the
// cold-reopen re-seed. 10 minutes rather than Claude Code's 5.
const IDLE_TTL_MS = 10 * 60_000
// Soft cap on concurrently-held live records. Each is just a subscription +
// in-memory view, so the cap is generous; the oldest idle record is evicted
// when a new one would exceed it (a busy record is never evicted).
const MAX_LIVE_SESSIONS = 32

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
  // Idle eviction must never fire mid-run: hold the timer off while busy, and
  // (re)arm it whenever the session is idle.
  if (processing) clearIdleTimer(rec)
  else armIdleTimer(rec)
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

function clearIdleTimer(rec: SessionRecord): void {
  if (rec.idleTimer) {
    clearTimeout(rec.idleTimer)
    rec.idleTimer = null
  }
}

function armIdleTimer(rec: SessionRecord): void {
  clearIdleTimer(rec)
  rec.idleTimer = setTimeout(() => {
    rec.idleTimer = null
    // A run may have started after the timer was armed — re-check and never
    // evict a busy session.
    if (isOpenClawProcessing(rec.workspaceId, rec.sessionId)) return
    teardownOpenClawSession(rec)
  }, IDLE_TTL_MS)
}

// Drop a live session: stop consuming its frames, release the gateway
// subscription, and forget it. Idempotent — a record already removed from the
// map is a no-op. REST reads (`sessionEvents`/`ensureOpenClawSessionLive`) still
// work afterward: `getOrCreateOpenClawSession` cold-reopens and re-seeds from
// `sessions.get` (or synthesizes cron turns), so eviction only costs a re-seed.
export function teardownOpenClawSession(rec: SessionRecord): void {
  const k = recKey(rec.workspaceId, rec.sessionId)
  if (sessions.get(k) !== rec) return
  clearIdleTimer(rec)
  rec.ingestUnsubscribe?.()
  rec.ingestUnsubscribe = undefined
  // Release the refcounted subscription. When connected, go through the handle
  // (drops demand + issues the wire unsubscribe on the last holder); never force
  // a connect from teardown. With no live handle (disconnected, or a test
  // without a gateway) still drop the demand so a reconnect won't replay a dead
  // key — the wire is already down.
  const gw = currentGatewayHandle()
  if (gw) {
    void gw
      .releaseSessionSubscription(rec.sessionKey)
      .catch(err => console.error('[openclaw-session] releaseSessionSubscription failed', err))
  } else {
    releaseSessionSubscriptionRef(rec.sessionKey)
  }
  // Clear this workspace's trailing list-refresh timer only when no other live
  // session remains for it — otherwise a sibling still needs it.
  const workspaceHasOtherLive = [...sessions.values()].some(
    r => r !== rec && r.workspaceId === rec.workspaceId
  )
  if (!workspaceHasOtherLive) {
    const entry = lastListRefresh.get(rec.workspaceId)
    if (entry?.trailing) clearTimeout(entry.trailing)
    lastListRefresh.delete(rec.workspaceId)
  }
  const wasProcessing = isOpenClawProcessing(rec.workspaceId, rec.sessionId)
  sessions.delete(k)
  openclawAgents.delete(k)
  // If it was mid-run, mirror setProcessing(rec, false, null)'s client-visible
  // effect so no spinner is left hanging.
  if (wasProcessing) {
    broadcast(rec.workspaceId, { type: 'status', sessionId: rec.sessionId, activity: 'idle' })
  }
}

// Server shutdown: tear down every live record so no session keeps consuming
// frames. We deliberately do NOT stop the shared gateway client — process exit
// drops it, and discovery may still need it during the same run. A cold reopen
// re-seeds from `sessions.get`.
export function killAllOpenClawSessions(): void {
  for (const rec of [...sessions.values()]) teardownOpenClawSession(rec)
}

// Run-end reconcile against the canonical transcript. `toolResult` rows never
// stream (NOTES.md §6) and a row can grow content after it streams, so this is
// how the view catches up. Idempotent.
function reconcileAfterRun(rec: SessionRecord): Promise<void> {
  // Both sessions.changed and agent lifecycle can end a run; coalesce onto one
  // in-flight transcript fetch rather than racing two.
  if (rec.reconcilePromise) return rec.reconcilePromise
  const p = reconcileAfterRunImpl(rec).finally(() => {
    if (rec.reconcilePromise === p) rec.reconcilePromise = undefined
  })
  rec.reconcilePromise = p
  return p
}

async function reconcileAfterRunImpl(rec: SessionRecord): Promise<void> {
  const detail = await getOpenClawSessionMessages(rec.sessionId, rec.workspacePath, rec.agentId)
  if (!detail?.messages) return
  mergeTranscript(rec, detail.messages)
}

// Test seam: the merge half of the reconcile, against a transcript the caller
// supplies instead of one fetched over the gateway.
export function reconcileForTest(rec: SessionRecord, messages: OpenClawMessage[]): void {
  mergeTranscript(rec, messages)
}

// Fold a canonical transcript into the live view: adopt rows we're missing or
// behind on, refresh tool results, and end any live card the run left running.
function mergeTranscript(rec: SessionRecord, messages: OpenClawMessage[]): void {
  const owners = new Set<OpenClawMessage>()
  for (const msg of messages) {
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
    // Adopt rows we never saw AND rows whose content grew after they streamed.
    // Both happen on the live wire: a row that fans out several tool calls is
    // pushed as text and gains its `toolCall` blocks silently afterwards, so a
    // has-the-id check alone leaves the view permanently behind the transcript.
    const known = rec.messagesById.get(id)
    if (!known || !sameContent(known, msg)) {
      rec.messagesById.set(id, msg)
      rememberSeq(rec, msg)
      owners.add(msg)
    }
  }
  // A live card whose result frame never arrived would otherwise spin for the
  // rest of the session: the run is over, so nothing more is coming. Some
  // runtimes never persist tool rows at all, so the transcript can't answer
  // for these — end them here rather than leaving a permanent spinner.
  for (const toolCallId of rec.liveTools.keys()) {
    const result = rec.results.get(toolCallId)
    if (!result?.running) continue
    rec.results.set(toolCallId, { ...result, running: false })
    emitLiveToolTurn(rec, toolCallId)
  }
  if (owners.size === 0) return
  let idx = 0
  for (const m of rec.messagesById.values()) {
    if (owners.has(m)) emitTurn(rec, m, idx)
    idx++
  }
}

// Do two versions of the same durable row carry the same content? Structural
// compare on the blocks only — the fields around them (usage, stopReason) can
// be filled in later without changing what the turn renders.
function sameContent(a: OpenClawMessage, b: OpenClawMessage): boolean {
  return JSON.stringify(a.content) === JSON.stringify(b.content)
}

// Re-derive the view from the current messages + results map. Cheaper than
// it sounds because we keep the materialized `view` and re-build only when
// a tool-result update forces a re-emit.
function rebuildView(rec: SessionRecord): void {
  let view: ViewState = emptyViewState()
  let i = 0
  // Mirror the cold path (adapter.toStreamEvents): reconstruct model-change
  // notices from the durable rows so a seeded live view replays the same
  // notices the static transcript would show. Same ids as the live emitter,
  // so a notice seen live upserts instead of duplicating.
  let prevModel: string | undefined
  for (const msg of rec.messagesById.values()) {
    if (msg.role === 'assistant') {
      const model = (msg as { model?: unknown }).model
      if (typeof model === 'string') {
        if (prevModel !== undefined && prevModel !== model) {
          view = applyEvent(view, {
            kind: 'notice',
            notice: {
              id: `openclaw:model-change:${msg.__openclaw?.id ?? i}`,
              kind: 'model-change',
              at:
                typeof msg.timestamp === 'number'
                  ? new Date(msg.timestamp).toISOString()
                  : new Date().toISOString(),
              model,
              prev: prevModel
            }
          })
        }
        prevModel = model
      }
    }
    const turn = messageToTurn(msg, rec.sessionKey, i++, rec.results, liveToolIds(rec))
    if (turn) view = applyEvent(view, { kind: 'turn', turn })
  }
  // Compaction notices have no durable twin in `sessions.get` — they exist
  // only while a live record witnesses the compact frame (known gap; the
  // gateway's `sessions.compaction.list` could backfill them).
  rec.view = view
  // Seed the model cache so live ingest can detect the next switch off the last
  // assistant model without re-scanning the transcript.
  rec.lastAssistantModel = prevModel
}

// The preview slot for a run. Doubles as `meta.apiMessageId` on the run's
// committed assistant turns so the client's native preview reconciliation
// clears the live text the instant the durable turn lands.
function previewMessageId(sessionKey: string, runId: string): string {
  return `openclaw:${sessionKey}:${runId}`
}

// Compare the optimistic send text against the durable user-row text
// tolerantly: drop any moi-context envelope (defensive — the optimistic side
// shouldn't carry it) and collapse all whitespace runs so newline/trim drift
// between what we sent and what the gateway stored can't defeat the match.
export function normalizeEchoText(text: string | undefined): string {
  if (typeof text !== 'string') return ''
  return stripMoiContext(text).replace(/\s+/g, ' ').trim()
}

// Synthetic turns (live tool cards, live thinking spans) have no transcript
// row, so they get a fractional position just past the last durable row we
// ingested. That keeps them after the text that introduced them and before
// whatever the backend commits next, without ever colliding with a real seq.
function liveTurnSeq(rec: SessionRecord): number {
  rec.liveTurnTick += 1
  return rec.lastDurableSeq + rec.liveTurnTick / 1000
}

// Tool calls owned by a live card, for the adapter to leave out of durable
// rows. `undefined` when there are none, so the common path allocates nothing.
function liveToolIds(rec: SessionRecord): ReadonlySet<string> | undefined {
  return rec.liveTools.size > 0 ? new Set(rec.liveTools.keys()) : undefined
}

function emitTurn(rec: SessionRecord, msg: OpenClawMessage, idx: number): void {
  const turn = messageToTurn(msg, rec.sessionKey, idx, rec.results, liveToolIds(rec))
  if (!turn) return
  // Optimistic-id rendezvous: re-id the durable user row to the bubble the
  // client already drew, so it upserts in place instead of duplicating.
  if (rec.pendingUserEchoes.length > 0 && turn.role === 'user') {
    const idem = messageIdempotencyKey(msg)
    // Three ways in, cheapest first: the send's own `<runId>:user` key; the
    // same key with the runId read off the row (the echo can beat the
    // `sessions.send` response); and normalized text, for rows carrying
    // neither.
    const idemRunId = idem?.endsWith(':user') ? idem.slice(0, -':user'.length) : undefined
    let at = idem
      ? rec.pendingUserEchoes.findIndex(
          e => (e.runId && `${e.runId}:user` === idem) || (idemRunId && e.runId === idemRunId)
        )
      : -1
    if (at < 0) {
      const text = normalizeEchoText(turn.parts.find(p => p.type === 'text')?.text)
      if (text) at = rec.pendingUserEchoes.findIndex(e => normalizeEchoText(e.text) === text)
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

// A `chat` delta frame carries the whole in-progress message; map its blocks to
// cumulative PreviewBlocks. Text and thinking only — tool calls have their own
// cards. Exported for tests.
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

// A gateway streams the assistant text on BOTH `chat` state=delta and `agent`
// stream=assistant, for the same run, in the same millisecond. Whichever emits
// first claims the run so the two cumulative snapshots can't race into a
// flicker; a gateway sending only one of them still streams.
type PreviewSource = 'chat' | 'agent'
// Exported for tests: only reads/writes the two preview-source fields.
export function claimPreviewSource(
  rec: Pick<SessionRecord, 'previewRunId' | 'previewSource'>,
  runId: string,
  source: PreviewSource
): boolean {
  if (rec.previewRunId !== runId) {
    rec.previewRunId = runId
    rec.previewSource = source
    return true
  }
  return rec.previewSource === source
}

function broadcastPreview(rec: SessionRecord, messageId: string, blocks: PreviewBlock[]): void {
  broadcast(rec.workspaceId, {
    type: 'preview',
    sessionId: rec.sessionId,
    messageId,
    parentToolUseId: null,
    blocks
  })
}

// Repaint the preview from both streams at once: reasoning first (it precedes
// the answer), then the text. A preview replaces every block for its messageId,
// so broadcasting the two separately would erase one with the other. Keyed by
// runId rather than by the claim, so reasoning can never lock the text source
// out of its own run.
function emitMergedPreview(rec: SessionRecord, runId: string, messageId: string): void {
  const blocks: PreviewBlock[] = []
  const reasoning = rec.previewReasoning?.runId === runId ? rec.previewReasoning.text : ''
  if (reasoning) blocks.push({ index: 0, kind: 'reasoning', text: reasoning })
  if (rec.previewTextBlocks?.runId === runId) {
    for (const block of rec.previewTextBlocks.blocks)
      blocks.push({ ...block, index: blocks.length })
  }
  broadcastPreview(rec, messageId, blocks)
}

// Drop the per-run preview state once the run terminalizes, so the next run
// starts clean instead of inheriting the previous run's reasoning.
function clearPreviewState(rec: SessionRecord): void {
  rec.previewReasoning = undefined
  rec.previewTextBlocks = undefined
}

// `agent` stream=assistant / reasoning frames carry the cumulative in-progress
// text in `data.text` — the fallback streaming source for gateways that don't
// emit `chat` delta frames.
function handleAgentStreamFrame(rec: SessionRecord, payload: Record<string, unknown>): void {
  if (!rec.streamEnabled) return
  const stream = payload.stream
  // `thinking` is a second wire name for the reasoning stream, carrying the
  // same `{ text, delta }` shape as `assistant`. Matching only `reasoning`
  // dropped it on the floor. Verified on the wire from the `openai-codex`
  // responses transport (`…:skill-workshop-review:*` sessions stream real
  // reasoning text under `stream: 'thinking'`). Note this does NOT light up
  // the claude-cli backend: its `thinking` frames are bare
  // `{ progressTokens }` heartbeats with no text at all, so they fall out on
  // the empty-text check below — that backend simply never ships the words.
  const kind: PreviewBlock['kind'] | null =
    stream === 'assistant'
      ? 'text'
      : stream === 'reasoning' || stream === 'thinking'
        ? 'reasoning'
        : null
  if (!kind) return
  const runId = typeof payload.runId === 'string' ? payload.runId : rec.activeRunId
  if (!runId) return
  const data = payload.data as { text?: unknown } | undefined
  const text = typeof data?.text === 'string' ? data.text : ''
  if (!text) return
  if (kind === 'reasoning') {
    // Reasoning bypasses the text claim entirely — see `previewReasoning`.
    rec.previewReasoning = { runId, text }
  } else {
    if (!claimPreviewSource(rec, runId, 'agent')) return
    rec.previewTextBlocks = { runId, blocks: [{ index: 0, kind, text }] }
  }
  emitMergedPreview(rec, runId, previewMessageId(rec.sessionKey, runId))
}

// A dying run says why on three different frames with three different wordings
// (NOTES.md §6), and the reason is something the user can act on. Report the
// first that carries text; the rest are echoes. Without this the chat just
// stops — spinner off, nothing said.
export function reportRunError(rec: SessionRecord, runId: string, message: unknown): void {
  if (rec.reportedErrorRunId === runId) return
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return
  rec.reportedErrorRunId = runId
  broadcast(rec.workspaceId, { kind: 'error', sessionId: rec.sessionId, content: text })
}

function handleChatFrame(rec: SessionRecord, payload: Record<string, unknown>): void {
  const runId = typeof payload.runId === 'string' ? payload.runId : rec.activeRunId
  if (!runId) return
  // Errors are reported whether or not the client asked for token streaming —
  // the toggle governs previews, not whether failures are visible.
  if (payload.state === 'error') reportRunError(rec, runId, payload.errorMessage)
  if (!rec.streamEnabled) return
  const messageId = previewMessageId(rec.sessionKey, runId)
  const state = payload.state
  if (state === 'delta') {
    const message = payload.message as { content?: unknown } | undefined
    const blocks = chatPreviewBlocks(message?.content)
    if (blocks.length === 0) return
    if (!claimPreviewSource(rec, runId, 'chat')) return
    rec.previewTextBlocks = { runId, blocks }
    // Merged, not raw: on claude-cli the reasoning arrives on a separate
    // stream, and a bare broadcast here would wipe it off the preview.
    emitMergedPreview(rec, runId, messageId)
  } else if (state === 'final' || state === 'error' || state === 'aborted') {
    clearPreviewState(rec)
    // Belt-and-braces clear: the durable turn's apiMessageId already clears
    // the slot, but a trailing delta after the durable row would repaint it.
    // 'aborted' arrives when a steer/abort interrupts the run mid-stream —
    // without the clear the dead preview would linger (verified live).
    broadcastPreview(rec, messageId, [])
  }
}

// The id of the live tool turn for a toolCallId. Stable for the session, so
// every later frame for that call upserts the same card.
function liveToolTurnId(sessionKey: string, toolCallId: string): string {
  return `openclaw:${sessionKey}:livetool:${toolCallId}`
}

// Build (and broadcast) a synthetic assistant turn holding a single tool card,
// from the live tool state in `rec.liveTools` + `rec.results`. Used when a
// tool executes before its durable owner row exists.
function emitLiveToolTurn(rec: SessionRecord, toolCallId: string): void {
  const meta = rec.liveTools.get(toolCallId)
  if (!meta) return
  const result = rec.results.get(toolCallId)
  let state: ToolState = 'pending'
  if (result) state = result.running ? 'running' : result.isError ? 'error' : 'success'
  const call: ToolCall = {
    toolCallId,
    name: meta.name,
    caller: 'model',
    provider: 'openclaw',
    state,
    input: meta.input
  }
  if (result && !result.running) {
    if (result.isError) call.errorText = result.output
    else call.output = result.output
  }
  const turn: Turn = {
    id: liveToolTurnId(rec.sessionKey, toolCallId),
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts: [{ type: 'tool-call', call }],
    seq: meta.seq
  }
  rec.view = applyEvent(rec.view, { kind: 'turn', turn })
  broadcast(rec.workspaceId, { kind: 'turn', turn, sessionId: rec.sessionId })
}

// A run can die during admission, before it reports any lifecycle phase. The
// gateway announces that only as `sessions.changed { reason:
// 'chat.dispatch-error' }` — no runId, no error text — so the runId-keyed
// clauses never fire and the composer would spin forever. With no cause on the
// wire, say the one thing the user can act on.
export function handleDispatchError(rec: SessionRecord): void {
  setProcessing(rec, false, null)
  broadcast(rec.workspaceId, {
    kind: 'error',
    sessionId: rec.sessionId,
    content: 'OpenClaw could not start the run. Send the message again.'
  })
}

// The id of the run-scoped live thinking turn for a reasoning item.
function liveThinkingTurnId(sessionKey: string, itemId: string): string {
  return `openclaw:${sessionKey}:livethink:${itemId}`
}

// Some runtimes report reasoning as an `agent`/item frame of `kind: 'analysis'`
// (emitted by `extensions/codex`) — presence and timing, never text. Render
// what they do give: a "Thinking" row that becomes "Thought for 1.2s", instead
// of a silent gap before the first token. Not durable — nothing in the
// transcript backs it, so a cold reload drops the row.
export function handleReasoningItemFrame(
  rec: SessionRecord,
  payload: Record<string, unknown>
): void {
  const data = payload.data as
    | { itemId?: unknown; phase?: unknown; kind?: unknown; title?: unknown }
    | undefined
  if (!data || typeof data.itemId !== 'string') return
  // Only the analysis/Reasoning item; other item kinds are tool lifecycle.
  const isReasoning =
    data.kind === 'analysis' || String(data.title ?? '').toLowerCase() === 'reasoning'
  if (!isReasoning) return
  const itemId = data.itemId
  const at = typeof payload.ts === 'number' ? payload.ts : Date.now()

  if (data.phase === 'start') {
    rec.liveThinking.set(itemId, { startedAt: at })
  } else if (data.phase === 'end') {
    const started = rec.liveThinking.get(itemId)
    if (!started) return
    rec.liveThinking.set(itemId, { ...started, endedAt: at })
  } else {
    return
  }
  emitLiveThinkingTurn(rec, itemId)
}

function emitLiveThinkingTurn(rec: SessionRecord, itemId: string): void {
  const span = rec.liveThinking.get(itemId)
  if (!span) return
  const duration = span.endedAt !== undefined ? span.endedAt - span.startedAt : undefined
  const turn: Turn = {
    id: liveThinkingTurnId(rec.sessionKey, itemId),
    role: 'assistant',
    origin: { kind: 'user-input' },
    // Placed once, on the `start` frame — the `end` frame upserts the same
    // turn, so the row must not hop to a new position when it finishes.
    seq: (span.seq ??= liveTurnSeq(rec)),
    parts: [
      {
        type: 'reasoning',
        text: '',
        redacted: true,
        ...(duration !== undefined && duration >= 0 ? { durationMs: duration } : {})
      }
    ]
  }
  rec.view = applyEvent(rec.view, { kind: 'turn', turn })
  broadcast(rec.workspaceId, { kind: 'turn', turn, sessionId: rec.sessionId })
}

// Live tool state, from either frame family: `session.tool` and `agent`/tool
// are the same payload sent to disjoint audiences (NOTES.md §6), so one
// handler serves both. start/update → running, result → success/error with
// output. Exported for tests.
export function handleToolFrame(rec: SessionRecord, payload: Record<string, unknown>): void {
  const data = payload.data as
    | {
        phase?: unknown
        name?: unknown
        toolCallId?: unknown
        isError?: unknown
        result?: unknown
        args?: unknown
      }
    | undefined
  if (!data || typeof data.toolCallId !== 'string') return
  const id = data.toolCallId
  const name = typeof data.name === 'string' ? data.name : undefined
  const toolName = name ? { toolName: name } : {}
  if (data.phase === 'start' || data.phase === 'update') {
    // Does a durable row already own this call? If so it renders the card. If
    // not, this frame is the only evidence the call exists, so give it a turn of
    // its own. Which case applies is a property of the run, not of the backend
    // (NOTES.md §6) — asking the messages map is exact and needs no guess.
    if (
      name &&
      !rec.liveTools.has(id) &&
      findToolCallOwners(rec.messagesById.values(), id).length === 0
    ) {
      rec.liveTools.set(id, { name, input: data.args, seq: liveTurnSeq(rec) })
    }
    const existing = rec.results.get(id)
    if (existing && !existing.running) return // final result already landed
    rec.results.set(id, { output: '', isError: false, running: true, ...toolName })
  } else if (data.phase === 'result') {
    // Two result shapes on the wire: `{ content: [...] }` from the exec-style
    // tools, and a bare string from CLI-backed runtimes. Reading `.content` off
    // a string yields undefined, which rendered those cards with an empty body.
    const raw = data.result
    const content =
      typeof raw === 'string' ? raw : ((raw as { content?: unknown } | undefined)?.content ?? '')
    rec.results.set(id, {
      output: flattenToolResultContent(content as OpenClawMessage['content']),
      isError: data.isError === true,
      ...toolName
    })
  } else {
    return
  }
  const owners = findToolCallOwners(rec.messagesById.values(), id)
  if (owners.length > 0) reemitToolCallOwners(rec, id)
  else if (rec.liveTools.has(id)) emitLiveToolTurn(rec, id)
}

// Debounced session-list refresh. `sessions.changed` fires for every session
// under the agent and several records can hold subscriptions for one workspace,
// so bursts are the norm; the trailing flush catches the tail of one (a create
// followed straight away by the title patch).
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

// Exported for tests (the live subscription is the only production caller).
export function ingest(rec: SessionRecord, msg: OpenClawMessage): void {
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
      // Compare against the cached last assistant model instead of re-scanning
      // the whole messagesById map each frame. Same notice id (`__openclaw.id`)
      // as the cold rebuildView path, so live and cold agree on upsert.
      const prev = rec.lastAssistantModel
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
      rec.lastAssistantModel = model
    }
  }
  rec.messagesById.set(id, msg)
  rememberSeq(rec, msg)
  // Compute idx as insertion order — for an update use the existing position,
  // for a new message it's the last slot.
  let idx = 0
  for (const k of rec.messagesById.keys()) {
    if (k === id) break
    idx++
  }
  emitTurn(rec, msg, idx)
}

// Track the furthest transcript position we've ingested, so synthetic turns
// can be placed just past it (liveTurnSeq).
function rememberSeq(rec: SessionRecord, msg: OpenClawMessage): void {
  const seq = msg.__openclaw?.seq
  if (typeof seq === 'number' && seq > rec.lastDurableSeq) rec.lastDurableSeq = seq
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
      rememberSeq(rec, msg)
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
      // truthful even when the session is patched outside moi. Run-phase frames
      // nest it under `session`; `reason` frames flatten it onto the payload.
      const row = (payload.session ?? payload) as
        | { model?: unknown; modelProvider?: unknown; thinkingLevel?: unknown }
        | undefined
      if (row && typeof row.model === 'string' && typeof row.modelProvider === 'string') {
        rec.wireModel = `${row.modelProvider}/${row.model}`
      }
      if (row && typeof row.thinkingLevel === 'string') rec.appliedThinking = row.thinkingLevel
      // Every row carries the model's resolved thinking menu — the only source
      // the effort picker has for it (thinking.ts).
      if (row) recordOpenClawThinkingProfile(row)
      const phase = payload.phase as string | undefined
      const runId = payload.runId as string | undefined
      if (reason === 'chat.dispatch-error') {
        handleDispatchError(rec)
      } else if (phase === 'start' && runId) {
        setProcessing(rec, true, runId)
      } else if ((phase === 'end' || phase === 'error') && runId) {
        if (rec.activeRunId === runId) {
          setProcessing(rec, false, null)
          // Safety net: pick up any toolResult rows the live stream missed.
          reconcileAfterRun(rec).catch(err =>
            console.error('[openclaw-session] reconcile failed', err)
          )
        }
      }
    } else if (event === 'agent') {
      if (payload.sessionKey !== rec.sessionKey) return
      const stream = payload.stream as string | undefined
      // Streaming text/reasoning fallback for gateways that don't emit `chat`
      // delta frames (handleAgentStreamFrame no-ops when `chat` already owns
      // the run's TEXT; reasoning is merged in alongside it). `thinking` is a
      // second wire name for the reasoning stream — text-bearing on some
      // runtimes, a bare `{ progressTokens }` heartbeat on others, which the
      // empty-text check drops.
      if (stream === 'assistant' || stream === 'reasoning' || stream === 'thinking') {
        handleAgentStreamFrame(rec, payload)
        return
      }
      // Tool activity for runs WE started (see handleToolFrame for why the
      // same payload also arrives as `session.tool` for runs we only watch).
      if (stream === 'tool') {
        handleToolFrame(rec, payload)
        return
      }
      // Reasoning also surfaces as an `item` frame of kind `analysis` —
      // timing, no text.
      if (stream === 'item') {
        handleReasoningItemFrame(rec, payload)
        return
      }
      // Backstop for run lifecycle — `sessions.changed` should already cover
      // this, but `agent` lifecycle frames are the authoritative signal.
      if (stream !== 'lifecycle') return
      const runId = payload.runId as string | undefined
      const data = payload.data as { phase?: string; error?: unknown } | undefined
      const phase = data?.phase
      if (phase === 'error' && runId) reportRunError(rec, runId, data?.error)
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

  evictIdleIfNeeded()
  rec = {
    ...input,
    sessionKey,
    messagesById: new Map(),
    results: new Map(),
    view: emptyViewState(),
    activeRunId: null,
    seeded: false,
    // Default to whole-block delivery like the other harnesses: a cold-opened
    // (REST-ensured) live session must not broadcast previews until a send opts
    // in (send sets `streamEnabled = input.stream === true`).
    streamEnabled: false,
    pendingFrames: [],
    pendingUserEchoes: [],
    liveTools: new Map(),
    liveThinking: new Map(),
    lastDurableSeq: 0,
    liveTurnTick: 0
  }
  sessions.set(k, rec)
  await ensureSubscribed(rec)
  await seed(rec)
  return rec
}

// Evict one idle record to stay under the soft cap. A processing session is
// never evicted; if every record is busy we allow a temporary overflow rather
// than tearing down a live run.
function evictIdleIfNeeded(): void {
  if (sessions.size < MAX_LIVE_SESSIONS) return
  for (const rec of sessions.values()) {
    if (!isOpenClawProcessing(rec.workspaceId, rec.sessionId)) {
      teardownOpenClawSession(rec)
      return
    }
  }
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

// Apply the picker's model/effort to the gateway session before the send. The
// effort comes from that model's own learned menu (thinking.ts), so a rejection
// means the menu is stale — relearn from the error rather than failing the send.
// `reasoningLevel` rides along because it is the gateway's gate on emitting
// reasoning at all; it is only set when the user asked to think, so a session
// left at `off` keeps the gateway's default.
async function applySessionSettings(
  rec: SessionRecord,
  model: string | undefined,
  effort: string | undefined
): Promise<void> {
  const patch: Record<string, unknown> = {}
  // Patch the model only on a real change — `sessions.patch { model }` writes
  // agent config, so it is not free.
  //
  // Both comparisons are exact: rows echo back the provider of the ref that was
  // patched, and `anthropic/claude-sonnet-5` and `claude-cli/claude-sonnet-5`
  // are separate catalog entries a user can pick between, so a switch between
  // them has to reach the gateway.
  const moved = rec.wireModel !== undefined && rec.wireModel !== rec.requestedModel
  if (model && (model !== rec.requestedModel || moved)) patch.model = model
  if (effort && effort !== rec.appliedThinking) patch.thinkingLevel = effort
  const reasoning = effort && effort !== 'off' ? 'stream' : undefined
  if (reasoning && reasoning !== rec.appliedReasoning) patch.reasoningLevel = reasoning
  if (Object.keys(patch).length === 0) return
  const gw = await getGateway()
  try {
    await gw.rpc('sessions.patch', { key: rec.sessionKey, ...patch })
  } catch (err) {
    // A level outside the model's menu is rejected by name; learn the real menu
    // from the message so the picker self-corrects, then degrade rather than
    // block the send. A rejected MODEL still throws — running on the wrong
    // model is worse than not sending.
    const relearned = recordOpenClawThinkingRejection(err)
    if (typeof patch.thinkingLevel === 'string') {
      console.warn(
        `[openclaw-session] thinkingLevel "${patch.thinkingLevel}" rejected${
          relearned ? ' (menu relearned from the gateway)' : ''
        }; sending at the session's current level`,
        err
      )
      const { thinkingLevel: _dropped, ...rest } = patch
      if (Object.keys(rest).length === 0) return
      await gw.rpc('sessions.patch', { key: rec.sessionKey, ...rest })
      if (typeof rest.model === 'string') rec.requestedModel = rest.model
      if (typeof rest.reasoningLevel === 'string') rec.appliedReasoning = rest.reasoningLevel
      return
    }
    throw err
  }
  if (typeof patch.model === 'string') rec.requestedModel = patch.model
  if (typeof patch.thinkingLevel === 'string') rec.appliedThinking = patch.thinkingLevel
  if (typeof patch.reasoningLevel === 'string') rec.appliedReasoning = patch.reasoningLevel
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
        agentId: input.agentId,
        // Carry the model IN the create rather than patching it just before
        // the send. `sessions.patch { model }` persists the pick into the
        // agent's effective `model.primary`, and on 2026.7.2-beta.x that config
        // write bumps the prepared-model-runtime generation and supersedes a run
        // being admitted right then: `sessions.send` answers `status: 'started'`
        // with a runId and the run is dead 2s later with `chat.dispatch-error`,
        // so the first message of a new chat fails and the resend works.
        //
        // Re-tested on the pinned 2026.7.1 and the race does NOT reproduce
        // there. Kept regardless: it is a round-trip fewer, the model belongs to
        // the session from the start, and it keeps new chats working on the beta
        // line. Only `model` may ride along — `sessions.create` rejects
        // `thinkingLevel` (`unexpected property`, verified live), and effort is
        // session-scoped anyway, so it stays a patch.
        ...(input.model ? { model: input.model } : {})
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
    // The create already carried the model, so record it as applied — otherwise
    // `applySessionSettings` sees an empty cache on this brand-new record and
    // issues exactly the pre-send `sessions.patch { model }` we just avoided.
    // A fresh session has no wire row to seed the cache from (that path only
    // fires once a row reports `modelProvider`/`model`), so this is the only
    // thing standing between the fix and the race coming straight back.
    if (input.isNew && input.model) rec.requestedModel = input.model
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

  // Omitted means whole-block delivery, same as the other harnesses.
  rec.streamEnabled = input.stream === true

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

// Test seam. The README sanctions tests importing harness internals; the live
// `sessions` map is otherwise private and creating a real record needs a
// gateway. This seeds a minimal live record so teardown/idle behavior can be
// exercised in unit tests without a connection.
export function createOpenClawSessionForTest(input: {
  workspaceId: string
  sessionId: string
  sessionKey: string
}): SessionRecord {
  const rec: SessionRecord = {
    workspaceId: input.workspaceId,
    workspacePath: '/test-workspace',
    agentId: 'test-agent',
    sessionId: input.sessionId,
    sessionKey: input.sessionKey,
    messagesById: new Map(),
    results: new Map(),
    view: emptyViewState(),
    activeRunId: null,
    seeded: true,
    streamEnabled: false,
    pendingFrames: [],
    pendingUserEchoes: [],
    liveTools: new Map(),
    liveThinking: new Map(),
    lastDurableSeq: 0,
    liveTurnTick: 0
  }
  sessions.set(recKey(input.workspaceId, input.sessionId), rec)
  return rec
}

// Test seam: put a record into the processing state a send would leave it in,
// so a test can assert that a terminal frame clears it.
export function markProcessingForTest(rec: SessionRecord, runId: string): void {
  setProcessing(rec, true, runId)
}

// Test seam: is a live record held for this (workspaceId, sessionId)?
export function hasOpenClawLiveSessionForTest(workspaceId: string, sessionId: string): boolean {
  return sessions.has(recKey(workspaceId, sessionId))
}
