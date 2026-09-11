// Per-(workspaceId, sessionId) live ACP session adapter.
//
// Providers choose a workspace or session process scope (see ./client.ts).
// This module owns the per-session state: the durable in-memory view, turn
// accounting for the processing spinner, and the mapping of `session/update`
// notifications onto moi's `StreamEvent`s.
//
// Provider-agnostic — `AcpProviderConfig` supplies the spawn spec and the few
// per-backend knobs (no-prompt mode id, MCP servers). Backend quirks that are
// NOT protocol are handled in the provider's own folder.
//
// Lifecycle notes:
//   - A brand-new session is created under the client's temporary uuid, then
//     renamed to the agent's real session id (`session_renamed`) — same flow
//     as the Claude Code, OpenClaw and Codex paths.
//   - moi queues a send that lands mid-turn and flushes it when
//     the running turn resolves.
//   - `session/prompt` is a long-running request that resolves at end of turn,
//     so its promise IS the turn's lifetime — activity is mirrored from it,
//     never derived by counting frames.
import { appendAttachmentNote } from '@/lib/attachment-note'
import { type MoiContext, appendMoiContext, renderMoiContext } from '@/lib/moi-context'
import { type Part, type Turn, applyEvent, emptyViewState } from '@/lib/format'
import type { Model, SessionActivity, StreamEvent, ViewState, WorkspaceType } from '@/lib/types'

import {
  type AcpProviderId,
  AssistantTurnAccumulator,
  acpToolCallToTurn,
  acpUsageToTurnMeta,
  replayedUserParts,
  toolTurnId
} from './adapter'
import { type AcpClient, type AcpSpawnSpec, getAcpClient, releaseAcpClient } from './client'
import { cacheAcpModelState } from './model-state'
import { appendRunDuration, runDurations } from './run-durations'
import {
  type AcpModelState,
  type AcpNewSessionResult,
  type AcpPromptBlock,
  type ContentChunk,
  type PromptResponse,
  type SessionUpdate,
  type ToolCallUpdate,
  isTextBlock
} from './wire'
import { agentStore } from '../../agent'
import { debug } from '../../debug'
import { broadcast } from '../../state'
import { renameSelectedSession } from '../../selected-session'
import { hasSessionConfig, renameSessionConfig, saveSessionConfig } from '../../session-config'
import { renameViewBuilderSession } from '../../view-builders'
import {
  type StoredUpload,
  materializeToPath,
  resolveUploads,
  uploadToDisplayPart
} from '../../uploads'

export type AcpSpawnContext = {
  workspaceId: string
  workspacePath: string
  agentId?: string
}

export type AcpProviderConfig = {
  id: WorkspaceType
  provider: AcpProviderId
  spawn: (ctx: AcpSpawnContext) => Promise<AcpSpawnSpec>
  processScope?: 'workspace' | 'session'
  modelState?: (result: AcpNewSessionResult) => AcpModelState
  defaultModel?: (ctx: AcpSpawnContext, config: AcpProviderConfig) => Promise<string | undefined>
  applySettings?: (
    client: AcpClient,
    sessionId: string,
    settings: { model?: string; effort?: string },
    state: AcpModelState
  ) => Promise<AcpModelState>
  normalizeToolUpdate?: (update: ToolCallUpdate, previous?: Turn) => ToolCallUpdate
  isOperationalMessage?: (text: string) => boolean
  // Provider mode that handles approvals without an interactive moi prompt.
  // It may still review or hold actions. Applied to new and resumed sessions.
  noPromptModeId?: string
  // Does the backend send images as base64 content blocks?
  supportsImages?: boolean
  // How the backend's model state becomes picker rows. ACP says nothing about
  // how `name`/`description` are formatted, so a backend that packs extra
  // structure into them (Hermes: the provider) unpacks it here. The full state
  // also preserves a structured provider default such as `currentModelId`.
  // Defaults to a straight catalog passthrough.
  mapModels?: (state: AcpModelState) => Model[]
  // Version stamp for the external inputs behind the model state (Hermes: the
  // profile's config file mtimes). The cached catalog is reused while it
  // matches and rediscovered when it changes, so a default edited outside moi
  // reaches the picker without a throwaway session per snapshot. Omit for
  // backends whose state is stable for the process lifetime.
  modelStateFingerprint?: (ctx: AcpSpawnContext) => Promise<string | undefined>
}

type QueuedSend = {
  blocks: AcpPromptBlock[]
  turnId: string
  parts: Part[]
  model?: string
  effort?: string
  stream?: boolean
}

type SessionRecord = {
  client: AcpClient
  config: AcpProviderConfig
  ready: boolean
  disposed: boolean
  cancelled: boolean
  lastUsed: number
  modelState: AcpModelState
  defaultModel?: string
  messageId?: string
  userMessageId?: string
  lastAssistantTurnId?: string
  workspaceId: string
  workspacePath: string
  agentId?: string
  sessionId: string
  view: ViewState
  processing: boolean
  // Live token streaming opt-in from the latest chat frame. ACP always
  // streams; this gates whether we forward previews.
  stream: boolean
  // Suppress preview forwarding while replaying history through the same
  // notification path.
  replaying: boolean
  acc: AssistantTurnAccumulator
  // Open user-message run, only ever populated during replay (ACP does not
  // echo live sends).
  userChunk: string
  // Image blocks of the open replayed user message. An image-only send has no
  // user text besides the envelope, so these are what keep its replayed turn
  // alive once the envelope strips away.
  userImageParts: Part[]
  // Tool calls seen this turn that never reached a terminal status — closed
  // at turn end so their cards don't hang (see ../hermes/NOTES.md §3.4).
  // Holds aliased ids (see toolCallSeq).
  openToolCalls: Set<string>
  // How many times each wire toolCallId has STARTED. Hermes replay ids are
  // `functions.<tool>:<index>` with the index scoped to one assistant message
  // (NOTES.md §3.4), so a session calling the same tool from several messages
  // repeats the id — upsert-by-id would collapse every occurrence into the
  // first turn. Each start past the first gets an aliased id; updates attach
  // to the latest start. Live `tc-<hash>` ids are unique, so the alias is a
  // no-op there.
  toolCallSeq: Map<string, number>
  model?: string
  queue: QueuedSend[]
  unsubscribe?: () => void
}

const sessions = new Map<string, SessionRecord>() // key: `${workspaceId}:${sessionId}`
const aliases = new Map<string, string>() // `${workspaceId}:${tempId}` -> real id
type Initialization = {
  workspacePath: string
  provider: WorkspaceType
  cancelled: boolean
  promise: Promise<SessionRecord>
}
const initializing = new Map<string, Initialization>()
const cancellations = new Map<string, number>()

// Opened fx histories each own a process. Release idle chats after ten minutes;
// a later send cold-loads the same durable session. Never evict a busy run.
const idleCleanup = setInterval(() => {
  for (const rec of sessions.values()) {
    if (rec.ready && !rec.processing && Date.now() - rec.lastUsed > 10 * 60_000) {
      forgetAcpSession(rec.workspaceId, rec.sessionId)
    }
  }
}, 60_000)
idleCleanup.unref()

function recKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

function liveKey(workspaceId: string, sessionId: string): string {
  const direct = recKey(workspaceId, sessionId)
  if (sessions.has(direct)) return direct
  const real = aliases.get(direct)
  return real ? recKey(workspaceId, real) : direct
}

export function getAcpActiveSessions(provider?: WorkspaceType): {
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}[] {
  const out: { workspaceId: string; sessionId: string; activity: SessionActivity }[] = []
  for (const s of sessions.values()) {
    if (provider && s.config.id !== provider) continue
    // ACP approvals are designed out (no-prompt mode + transport auto-approve
    // in client.ts), so `requires-action` never occurs. If that policy is
    // relaxed, `session/request_permission` is the signal to map to it.
    if (s.processing) {
      out.push({ workspaceId: s.workspaceId, sessionId: s.sessionId, activity: 'running' })
    }
  }
  return out
}

function setProcessing(rec: SessionRecord, processing: boolean) {
  if (rec.processing === processing) return
  rec.processing = processing
  broadcast(rec.workspaceId, {
    type: 'status',
    sessionId: rec.sessionId,
    activity: processing ? 'running' : 'idle'
  })
}

function emitTurnEvent(rec: SessionRecord, ev: StreamEvent) {
  if (rec.disposed) return
  if (ev.kind === 'turn' && ev.turn.role === 'assistant') rec.lastAssistantTurnId = ev.turn.id
  // ACP replay updates carry no timestamps, so replayed turns would get
  // stamped with replay-time `new Date()`s — and the client's duration label
  // (groupTurns: assistant timestamp minus the preceding user turn's) would
  // report how long the REPLAY took, "Worked for 1s" on every reloaded run.
  // The real duration is unrecoverable, so drop the timestamp instead; the
  // client falls back to a plain "Worked" label.
  if (ev.kind === 'turn' && rec.replaying && ev.turn.timestamp !== undefined) {
    const turn = { ...ev.turn }
    delete turn.timestamp
    ev = { kind: 'turn', turn }
  }
  rec.view = applyEvent(rec.view, ev)
  broadcast(rec.workspaceId, { ...ev, sessionId: rec.sessionId })
}

function forwardPreview(rec: SessionRecord) {
  if (!rec.stream || rec.replaying) return
  let blocks = rec.acc.previewBlocks()
  if (rec.config.isOperationalMessage) {
    // Keep a diagnostic prefix buffered until it can be classified. fx's
    // longest prefix is 24 characters; a split '[con' must not leak a preview.
    // Thought chunks have their own channel and must never be classified as
    // operational prose or hidden behind that text buffer.
    const text = blocks
      .filter(b => b.kind === 'text')
      .map(b => b.text)
      .join('')
    if (text.length < 24 || rec.config.isOperationalMessage(text)) {
      blocks = blocks.filter(b => b.kind !== 'text')
    }
  }
  if (!blocks.length) return
  broadcast(rec.workspaceId, {
    type: 'preview',
    sessionId: rec.sessionId,
    messageId: rec.acc.currentId,
    parentToolUseId: null,
    blocks
  })
}

function flushAssistant(
  rec: SessionRecord,
  meta?: Parameters<AssistantTurnAccumulator['flush']>[0]
) {
  const turn = rec.acc.flush(meta)
  if (turn) {
    const text = turn.parts.flatMap(p => (p.type === 'text' ? [p.text] : [])).join('')
    if (rec.config.isOperationalMessage?.(text)) {
      emitTurnEvent(rec, {
        kind: 'notice',
        notice: {
          id: turn.id,
          kind: 'warning',
          at: turn.timestamp ?? new Date().toISOString(),
          message: text
        }
      })
      // A provider can omit message ids on thought chunks, leaving genuine
      // reasoning beside operational text. Classify only the text: preserve
      // the remaining parts as a turn (and clear its live preview normally).
      const parts = turn.parts.filter(part => part.type !== 'text')
      if (parts.length) emitTurnEvent(rec, { kind: 'turn', turn: { ...turn, parts } })
    } else emitTurnEvent(rec, { kind: 'turn', turn })
  }
  if (meta && rec.lastAssistantTurnId) {
    const last = rec.view.turns.find(t => t.id === rec.lastAssistantTurnId)
    if (last)
      emitTurnEvent(rec, { kind: 'turn', turn: { ...last, meta: { ...last.meta, ...meta } } })
  }
  rec.messageId = undefined
}

function flushUserChunk(rec: SessionRecord) {
  if (!rec.userChunk && rec.userImageParts.length === 0) return
  // The chunk is the persisted prompt verbatim; fold the appended machinery
  // (moi-context envelope, attachment note) back out before the text becomes
  // a bubble. Replayed images render above the text like the live bubble, and
  // a turn with nothing left (no typed text, no images) drops entirely.
  const parts = [...rec.userImageParts, ...replayedUserParts(rec.userChunk)]
  rec.userChunk = ''
  rec.userImageParts = []
  if (parts.length === 0) return
  emitTurnEvent(rec, {
    kind: 'turn',
    turn: {
      id: `${rec.sessionId}:user:${rec.view.turns.length}`,
      role: 'user',
      origin: { kind: 'user-input' },
      parts,
      timestamp: new Date().toISOString()
    }
  })
}

function ingestToolCall(
  rec: SessionRecord,
  update: ToolCallUpdate,
  provider: AcpProviderId,
  isStart: boolean
) {
  // A tool call closes the open assistant run: text before it and text after
  // it are separate turns, so the transcript reads in execution order.
  flushAssistant(rec)
  flushUserChunk(rec)
  // Repeated wire ids (see toolCallSeq) get a per-occurrence alias so each
  // start is its own turn; a `tool_call_update` reuses the latest one.
  if (isStart) {
    rec.toolCallSeq.set(update.toolCallId, (rec.toolCallSeq.get(update.toolCallId) ?? 0) + 1)
  }
  const seen = rec.toolCallSeq.get(update.toolCallId) ?? 1
  const aliasedId = seen > 1 ? `${update.toolCallId}#${seen}` : update.toolCallId
  const aliased = aliasedId === update.toolCallId ? update : { ...update, toolCallId: aliasedId }
  const id = toolTurnId(rec.sessionId, aliasedId)
  const previous = rec.view.turns.find(t => t.id === id)
  const normalized = rec.config.normalizeToolUpdate?.(aliased, previous) ?? aliased
  const turn = acpToolCallToTurn({
    update: normalized,
    sessionId: rec.sessionId,
    provider,
    previous
  })
  const state = turn.parts.find(p => p.type === 'tool-call')
  const settled =
    state?.type === 'tool-call' && (state.call.state === 'success' || state.call.state === 'error')
  if (settled) rec.openToolCalls.delete(aliasedId)
  else rec.openToolCalls.add(aliasedId)
  emitTurnEvent(rec, { kind: 'turn', turn })
}

// Some backends omit terminal updates. Stop the spinner at turn end while
// keeping the outcome unknown: absence of a result is not proof of success.
function closeOpenToolCalls(
  rec: SessionRecord,
  reason = 'The agent ended without reporting a tool result.'
) {
  for (const toolCallId of rec.openToolCalls) {
    const id = toolTurnId(rec.sessionId, toolCallId)
    const turn = rec.view.turns.find(t => t.id === id)
    if (!turn) continue
    const part = turn.parts.find(p => p.type === 'tool-call')
    if (
      part?.type !== 'tool-call' ||
      part.call.state === 'success' ||
      part.call.state === 'error'
    ) {
      continue
    }
    emitTurnEvent(rec, {
      kind: 'turn',
      turn: {
        ...turn,
        parts: turn.parts.map(p =>
          p.type === 'tool-call'
            ? { ...p, call: { ...p.call, state: 'error' as const, errorText: reason } }
            : p
        )
      }
    })
  }
  rec.openToolCalls.clear()
}

function handleSessionUpdate(rec: SessionRecord, update: SessionUpdate, provider: AcpProviderId) {
  const messageId = (update as SessionUpdate & { messageId?: string }).messageId
  if (
    update.sessionUpdate === 'agent_message_chunk' ||
    update.sessionUpdate === 'agent_thought_chunk'
  ) {
    if (messageId && rec.messageId && messageId !== rec.messageId) flushAssistant(rec)
    if (messageId) rec.messageId = messageId
  }
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      flushUserChunk(rec)
      const block = (update as { content?: { text?: string } }).content
      rec.acc.append('text', block?.text ?? '')
      forwardPreview(rec)
      return
    }
    case 'agent_thought_chunk': {
      flushUserChunk(rec)
      // fx warnings have message ids, while its thought chunks may have none.
      // End the warning before appending thoughts so a later answer id cannot
      // turn the entire reasoning run into a warning notice.
      if (rec.config.isOperationalMessage) {
        const text = rec.acc
          .previewBlocks()
          .filter(block => block.kind === 'text')
          .map(block => block.text)
          .join('')
        if (rec.config.isOperationalMessage(text)) flushAssistant(rec)
      }
      const block = (update as { content?: { text?: string } }).content
      rec.acc.append('reasoning', block?.text ?? '')
      forwardPreview(rec)
      return
    }
    case 'user_message_chunk': {
      // Replay only — live sends are echoed by moi itself.
      flushAssistant(rec)
      if (messageId && rec.userMessageId && messageId !== rec.userMessageId) flushUserChunk(rec)
      rec.userMessageId = messageId
      const content = (update as Partial<ContentChunk>).content
      if (isTextBlock(content)) {
        rec.userChunk += content.text
      } else if (content?.type === 'image' && content.data) {
        // Rebuilt as a data URL — the cold-reload fallback (live bubbles point
        // at moi's served upload URL, but that store is gone after a restart).
        rec.userImageParts.push({
          type: 'file',
          mediaType: content.mimeType,
          url: `data:${content.mimeType};base64,${content.data}`
        })
      }
      return
    }
    case 'tool_call':
    case 'tool_call_update': {
      ingestToolCall(
        rec,
        update as unknown as ToolCallUpdate,
        provider,
        update.sessionUpdate === 'tool_call'
      )
      return
    }
    case 'session_info_update': {
      // The backend generated or refreshed a session title.
      if (!rec.replaying) {
        broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
      }
      return
    }
    case 'current_mode_update':
    case 'available_commands_update':
    case 'plan':
    case 'usage_update':
      // Not rendered yet: modes/commands have no UI, the plan lane is Codex's
      // and the context meter is not wired to a widget.
      return
  }
}

function handleNotification(
  rec: SessionRecord,
  config: AcpProviderConfig,
  method: string,
  params: Record<string, unknown>
) {
  if (rec.disposed) return
  if (method === '__exit') {
    // The agent died (crash or env-change restart). Drop the record so the
    // next message re-resumes against a fresh process.
    closeOpenToolCalls(rec, 'The agent exited before reporting a tool result.')
    flushAssistant(rec)
    disposeRecord(rec)
    return
  }
  if (method !== 'session/update') return
  if (params.sessionId !== rec.sessionId) return
  const update = params.update as SessionUpdate | undefined
  if (!update || typeof update.sessionUpdate !== 'string') return
  handleSessionUpdate(rec, update, config.provider)
}

// A send/turn failure can mean the backend lost its credentials outside moi,
// which the cached availability snapshot won't reflect until its TTL expires.
// Force a fresh probe so the composer's banner flips right away.
function refreshAvailability(
  rec: Pick<SessionRecord, 'workspaceId' | 'workspacePath'>,
  id: WorkspaceType
) {
  void agentStore.refresh({ id: rec.workspaceId, path: rec.workspacePath, type: id })
}

function createRecord(input: {
  workspaceId: string
  workspacePath: string
  agentId?: string
  sessionId: string
  client: AcpClient
  config: AcpProviderConfig
  model?: string
}): SessionRecord {
  const rec: SessionRecord = {
    client: input.client,
    config: input.config,
    ready: false,
    disposed: false,
    cancelled: false,
    lastUsed: Date.now(),
    modelState: {},
    workspaceId: input.workspaceId,
    workspacePath: input.workspacePath,
    agentId: input.agentId,
    sessionId: input.sessionId,
    view: emptyViewState(),
    processing: false,
    stream: false,
    replaying: false,
    acc: new AssistantTurnAccumulator(input.sessionId, input.model, input.config.id),
    userChunk: '',
    userImageParts: [],
    openToolCalls: new Set(),
    toolCallSeq: new Map(),
    model: input.model,
    queue: []
  }
  rec.unsubscribe = input.client.onNotification((method, params) =>
    handleNotification(rec, input.config, method, params)
  )
  sessions.set(recKey(rec.workspaceId, rec.sessionId), rec)
  return rec
}

// Apply the provider's policy for handling approvals without a moi prompt.
async function applyNoPromptMode(client: AcpClient, config: AcpProviderConfig, sessionId: string) {
  if (!config.noPromptModeId) return
  await client.rpc('session/set_mode', { sessionId, modeId: config.noPromptModeId })
}

function disposeRecord(rec: SessionRecord) {
  if (rec.disposed) return
  rec.queue.length = 0
  rec.cancelled = true
  if (rec.processing && rec.client.isAlive()) {
    try {
      rec.client.notify('session/cancel', { sessionId: rec.sessionId })
    } catch {}
  }
  setProcessing(rec, false)
  rec.disposed = true
  rec.unsubscribe?.()
  const key = recKey(rec.workspaceId, rec.sessionId)
  if (sessions.get(key) === rec) sessions.delete(key)
  if (rec.config.processScope === 'session') releaseAcpClient(rec.client)
}

function initializeSession(
  config: AcpProviderConfig,
  input: AcpSpawnContext & { sessionId: string; isNew?: boolean }
): Promise<SessionRecord> {
  const canonicalId = aliases.get(recKey(input.workspaceId, input.sessionId))
  if (canonicalId) input = { ...input, sessionId: canonicalId, isNew: false }
  const key = liveKey(input.workspaceId, input.sessionId)
  const pending = initializing.get(key)
  if (pending) return pending.promise
  const existing = sessions.get(key)
  if (existing?.ready && !existing.disposed && existing.config.id === config.id) {
    existing.lastUsed = Date.now()
    return Promise.resolve(existing)
  }
  const init: Initialization = {
    workspacePath: input.workspacePath,
    provider: config.id,
    cancelled: false,
    promise: Promise.resolve(undefined as unknown as SessionRecord)
  }
  // Publish the initialization before any asynchronous work, including spawn.
  initializing.set(key, init)
  init.promise = (async () => {
    const spec = await config.spawn(input)
    const client = await getAcpClient({
      ...spec,
      ...(config.processScope === 'session' ? { scope: `chat:${input.sessionId}` } : {})
    })
    let rec: SessionRecord | undefined
    try {
      if (init.cancelled) throw new Error('Chat was closed while connecting')
      // Install the receiver before load: it emits history before its response.
      if (!input.isNew) {
        rec = createRecord({ ...input, client, config })
        rec.replaying = true
      }
      const result = await client.rpc<AcpNewSessionResult>(
        input.isNew ? 'session/new' : 'session/load',
        {
          ...(input.isNew ? {} : { sessionId: input.sessionId }),
          cwd: input.workspacePath,
          mcpServers: []
        }
      )
      if (init.cancelled || rec?.disposed) throw new Error('Chat was closed while connecting')
      const realId = input.isNew ? result.sessionId : input.sessionId
      if (!realId) throw new Error(`${config.id} returned no session id`)
      initializing.set(recKey(input.workspaceId, realId), init)
      if (!rec) rec = createRecord({ ...input, sessionId: realId, client, config })
      const state = config.modelState?.(result) ?? result.models ?? {}
      if (!input.isNew && config.defaultModel) {
        state.defaultModelId = await config.defaultModel(input, config)
      }
      rec.modelState = state
      rec.model = state.currentModelId
      rec.defaultModel = state.defaultModelId ?? state.currentModelId
      flushAssistant(rec)
      flushUserChunk(rec)
      closeOpenToolCalls(rec, 'No tool completion was recorded in this chat.')
      rec.replaying = false
      rec.acc.setModel(rec.model)
      if (!input.isNew) await attachReplayDurations(rec)
      await applyNoPromptMode(client, config, realId)
      // Restored selectors describe the active chat, including its effort
      // options. Cache them only when the provider's actual default has been
      // resolved separately, so a saved model cannot become the default row.
      const cacheModelState =
        input.isNew || (config.defaultModel !== undefined && state.defaultModelId !== undefined)
      if (cacheModelState) {
        const fingerprint = await config.modelStateFingerprint?.(input)
        cacheAcpModelState(input.workspacePath, state, fingerprint, config.id)
      }
      if (realId !== input.sessionId) {
        // Both ids share the initialization until policy and persistence finish.
        aliases.set(recKey(input.workspaceId, input.sessionId), realId)
        initializing.set(recKey(input.workspaceId, realId), init)
        await renameSessionConfig(input.workspacePath, input.sessionId, realId)
        await renameSelectedSession(input.workspacePath, input.sessionId, realId)
        await renameViewBuilderSession(
          input.workspaceId,
          input.workspacePath,
          input.sessionId,
          realId
        )
        broadcast(input.workspaceId, { type: 'session_renamed', from: input.sessionId, to: realId })
      }
      if (init.cancelled || rec.disposed) throw new Error('Chat was closed while connecting')
      rec.ready = true
      if (!input.isNew && cacheModelState) refreshAvailability(rec, config.id)
      return rec
    } catch (error) {
      if (rec) disposeRecord(rec)
      else if (config.processScope === 'session') releaseAcpClient(client)
      throw error
    }
  })().finally(() => {
    for (const [pendingKey, entry] of initializing) {
      if (entry === init) initializing.delete(pendingKey)
    }
  })
  return init.promise
}

function resumeSession(config: AcpProviderConfig, input: AcpSpawnContext & { sessionId: string }) {
  return initializeSession(config, input)
}

// Re-attach the live-recorded run durations to a replayed transcript: split
// it into runs at user turns and stamp each run's FINAL turn — groupTurns'
// meta merge carries the last turn's `durationMs` onto the merged run, which
// is where the "Worked for Xs" label reads it. Only applied when the replayed
// run count matches the recording exactly: a session also driven outside moi,
// or a replayed user turn that folded to nothing, would misalign every later
// run — and a missing label beats a wrong one.
async function attachReplayDurations(rec: SessionRecord): Promise<void> {
  const durations = await runDurations(rec.workspacePath, rec.sessionId)
  if (durations.length === 0) return
  const runEnds: number[] = []
  let openRun = false
  rec.view.turns.forEach((turn, i) => {
    if (turn.role === 'user') {
      openRun = true
      return
    }
    // Every non-user turn (text, reasoning, tool call) extends the run that
    // the last user turn opened; turns before any user turn belong to none.
    if (openRun) {
      runEnds.push(i)
      openRun = false
    } else if (runEnds.length > 0) {
      runEnds[runEnds.length - 1] = i
    }
  })
  if (runEnds.length !== durations.length) return
  runEnds.forEach((endIndex, run) => {
    const turn = rec.view.turns[endIndex]
    emitTurnEvent(rec, {
      kind: 'turn',
      turn: { ...turn, meta: { ...turn.meta, durationMs: durations[run] } }
    })
  })
}

// Turn typed text + resolved uploads into ACP prompt blocks and the display
// parts for the user's bubble. Images ride inline as base64 blocks; other
// files are materialized to a temp path and referenced in an attachment note.
async function buildPrompt(
  text: string,
  uploads: StoredUpload[],
  supportsImages: boolean
): Promise<{ blocks: AcpPromptBlock[]; parts: Part[] }> {
  const parts: Part[] = []
  for (const u of uploads) {
    const part = uploadToDisplayPart(u)
    if (part) parts.push(part)
  }
  if (text) parts.push({ type: 'text', text })

  const blocks: AcpPromptBlock[] = []
  const files: { filename: string; path: string }[] = []
  for (const u of uploads) {
    if (u.kind === 'image' && u.data && supportsImages) {
      blocks.push({ type: 'image', mimeType: u.mediaType, data: u.data.toString('base64') })
    } else if (u.kind === 'file' || (u.kind === 'image' && !supportsImages)) {
      const p = await materializeToPath(u)
      if (p) files.push({ filename: u.filename, path: p })
    }
  }
  const agentText = appendAttachmentNote(text, files)
  if (agentText) blocks.unshift({ type: 'text', text: agentText })
  return { blocks, parts }
}

// Run one prompt to completion, then drain anything queued behind it.
async function runPrompt(
  config: AcpProviderConfig,
  rec: SessionRecord,
  send: QueuedSend
): Promise<void> {
  if (rec.disposed) return
  setProcessing(rec, true)
  rec.cancelled = false
  rec.stream = send.stream === true
  rec.lastAssistantTurnId = undefined
  const startedAt = Date.now()
  let prompted = false
  try {
    if (config.applySettings) {
      const previousState = rec.modelState
      rec.modelState = await config.applySettings(
        rec.client,
        rec.sessionId,
        {
          model: send.model === 'default' ? rec.defaultModel : send.model,
          effort: send.effort
        },
        rec.modelState
      )
      if (rec.modelState !== previousState) {
        const fingerprint = await config.modelStateFingerprint?.(rec)
        cacheAcpModelState(rec.workspacePath, rec.modelState, fingerprint, config.id)
        refreshAvailability(rec, config.id)
      }
      rec.model = rec.modelState.currentModelId
      rec.acc.setModel(rec.model)
    } else {
      const model = send.model === 'default' ? rec.defaultModel : send.model
      if (model && model !== rec.model) await setSessionModel(rec, model)
    }
    if (rec.disposed || rec.cancelled) return
    if (send.model && !(await hasSessionConfig(rec.workspacePath, rec.sessionId))) {
      await saveSessionConfig(rec.workspacePath, rec.sessionId, { model: send.model })
    }
    if (rec.disposed || rec.cancelled) return
    emitTurnEvent(rec, {
      kind: 'turn',
      turn: {
        id: send.turnId,
        role: 'user',
        origin: { kind: 'user-input' },
        parts: send.parts,
        timestamp: new Date().toISOString()
      }
    })
    prompted = true
    const res = await rec.client.rpc<PromptResponse>('session/prompt', {
      sessionId: rec.sessionId,
      prompt: send.blocks
    })
    if (rec.disposed) return
    closeOpenToolCalls(
      rec,
      res.stopReason === 'cancelled'
        ? 'The run was stopped before the tool reported a result.'
        : undefined
    )
    flushAssistant(rec, {
      ...(rec.model ? { model: rec.model } : {}),
      provider: config.id,
      durationMs: Date.now() - startedAt,
      ...(res.stopReason ? { stopReason: res.stopReason } : {}),
      ...(acpUsageToTurnMeta(res.usage) ? { usage: acpUsageToTurnMeta(res.usage) } : {})
    })
    if (res.stopReason === 'cancelled') {
      broadcast(rec.workspaceId, { kind: 'stopped', sessionId: rec.sessionId })
    }
    broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
  } catch (err) {
    if (!rec.disposed) {
      closeOpenToolCalls(rec, 'The run failed before the tool reported a result.')
      flushAssistant(rec)
    }
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'send failed'
    })
    // A failed turn must not silently send queued requests in a replacement process.
    rec.queue.length = 0
    // A multi-step settings operation can change the model before a later
    // effort change fails. Reload on the next send to recover confirmed state.
    if (!prompted && config.applySettings) disposeRecord(rec)
    refreshAvailability(rec, config.id)
  } finally {
    if (prompted) {
      await appendRunDuration(rec.workspacePath, rec.sessionId, Date.now() - startedAt).catch(
        error => {
          debug(`${config.id} run duration could not be saved: ${String(error)}`)
        }
      )
    }
    rec.lastUsed = Date.now()
    const next = !rec.disposed && rec.client.isAlive() ? rec.queue.shift() : undefined
    if (next) void runPrompt(config, rec, next)
    else setProcessing(rec, false)
  }
}

export async function sendAcpMessage(
  config: AcpProviderConfig,
  input: {
    workspaceId: string
    workspacePath: string
    agentId?: string
    sessionId: string
    isNew: boolean
    content: string
    attachments?: string[]
    optimisticId?: string
    model?: string
    effort?: string
    stream?: boolean
    context?: MoiContext
  }
): Promise<void> {
  const sendKey = liveKey(input.workspaceId, input.sessionId)
  const cancellation = cancellations.get(sendKey) ?? 0
  const uploads = input.attachments?.length
    ? resolveUploads(input.workspaceId, input.attachments)
    : []
  if (!input.content && uploads.length === 0) return
  const { blocks, parts } = await buildPrompt(
    input.content,
    uploads,
    config.supportsImages !== false
  )
  if (blocks.length === 0) return

  // ACP has no native ambient-context channel, so the envelope rides in the
  // text block. The backend persists that text verbatim and echoes it on
  // `session/load`, so the replay side strips it back out (replayedUserParts
  // via flushUserChunk) before the text reaches a bubble.
  if (input.context) {
    const envelope = renderMoiContext(input.context)
    const first = blocks[0]
    if (first?.type === 'text') first.text = appendMoiContext(first.text, envelope)
    else blocks.unshift({ type: 'text', text: envelope })
  }

  if ((cancellations.get(sendKey) ?? 0) !== cancellation) {
    broadcast(input.workspaceId, { type: 'status', sessionId: input.sessionId, activity: 'idle' })
    return
  }
  let rec: SessionRecord
  try {
    rec = await initializeSession(config, input)
  } catch (err) {
    broadcast(input.workspaceId, { type: 'status', sessionId: input.sessionId, activity: 'idle' })
    broadcast(input.workspaceId, {
      kind: 'error',
      sessionId: input.sessionId,
      content: err instanceof Error ? err.message : `failed to start ${config.id} session`
    })
    refreshAvailability(
      { workspaceId: input.workspaceId, workspacePath: input.workspacePath },
      config.id
    )
    return
  }

  const send: QueuedSend = {
    blocks,
    parts,
    turnId: input.optimisticId ?? crypto.randomUUID(),
    model: input.model,
    effort: input.effort,
    stream: input.stream
  }
  if (rec.processing) {
    rec.queue.push(send)
    return
  }
  await runPrompt(config, rec, send)
}

async function setSessionModel(rec: SessionRecord, modelId: string): Promise<void> {
  await rec.client.rpc('session/set_model', { sessionId: rec.sessionId, modelId })
  rec.model = modelId
  rec.modelState = { ...rec.modelState, currentModelId: modelId }
  rec.acc.setModel(modelId)
}

export async function interruptAcpRun(
  config: AcpProviderConfig,
  input: { workspaceId: string; sessionId: string }
): Promise<void> {
  const key = liveKey(input.workspaceId, input.sessionId)
  cancellations.set(key, (cancellations.get(key) ?? 0) + 1)
  const pending = initializing.get(key)
  if (pending) pending.cancelled = true
  const rec = sessions.get(key)
  if (!rec) return
  if (!rec.ready) {
    disposeRecord(rec)
    return
  }
  // Drop anything queued behind the running turn — an interrupt means "stop",
  // not "skip to the next message".
  rec.queue.length = 0
  try {
    rec.cancelled = true
    const client = rec.client
    // `session/cancel` is a notification: the in-flight `session/prompt`
    // resolves with stopReason "cancelled", which is where the stop is
    // broadcast from (runPrompt).
    client.notify('session/cancel', { sessionId: rec.sessionId })
  } catch (err) {
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'interrupt failed'
    })
    throw err
  }
}

export function viewAsEvents(rec: SessionRecord): StreamEvent[] {
  const evs: StreamEvent[] = []
  for (const turn of rec.view.turns) evs.push({ kind: 'turn', turn })
  for (const notice of rec.view.notices) evs.push({ kind: 'notice', notice })
  return evs
}

// Read-side hook for the REST events endpoint: return the live view when we
// hold one so REST + WS stay in agreement.
export function getLiveAcpEvents(workspaceId: string, sessionId: string): StreamEvent[] | null {
  const rec = sessions.get(liveKey(workspaceId, sessionId))
  if (rec) rec.lastUsed = Date.now()
  return rec?.ready && !rec.disposed ? viewAsEvents(rec) : null
}

// Cold-load: resume the session (also subscribing it on our connection) and
// return its events, so subsequent WS frames upsert into the same view.
export async function ensureAcpSessionLive(
  config: AcpProviderConfig,
  input: AcpSpawnContext & { sessionId: string }
): Promise<StreamEvent[]> {
  const rec = await resumeSession(config, input)
  return viewAsEvents(rec)
}

// Drop one live session record — used when a chat is archived, so its view and
// notification subscription go away instead of lingering for the process's life.
export function forgetAcpSession(workspaceId: string, sessionId: string): void {
  const key = liveKey(workspaceId, sessionId)
  const pending = initializing.get(key)
  if (pending) pending.cancelled = true
  const rec = sessions.get(key)
  if (rec) disposeRecord(rec)
  for (const [alias, real] of aliases) {
    if (alias === recKey(workspaceId, sessionId) || recKey(workspaceId, real) === key)
      aliases.delete(alias)
  }
}

export function forgetAcpWorkspaceSessions(workspacePath: string, provider?: WorkspaceType): void {
  for (const pending of initializing.values()) {
    if (pending.workspacePath === workspacePath && (!provider || pending.provider === provider))
      pending.cancelled = true
  }
  for (const rec of sessions.values()) {
    if (rec.workspacePath === workspacePath && (!provider || rec.config.id === provider))
      forgetAcpSession(rec.workspaceId, rec.sessionId)
  }
}

export function forgetAllAcpSessions(provider?: WorkspaceType): void {
  for (const pending of initializing.values()) {
    if (!provider || pending.provider === provider) pending.cancelled = true
  }
  for (const rec of sessions.values()) {
    if (!provider || rec.config.id === provider) forgetAcpSession(rec.workspaceId, rec.sessionId)
  }
  if (!provider) {
    aliases.clear()
    cancellations.clear()
  }
}
