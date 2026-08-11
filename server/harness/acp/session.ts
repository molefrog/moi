// Per-(workspaceId, sessionId) live ACP session adapter.
//
// One agent process per workspace (see ./client.ts) serves every session in
// it; this module owns the per-session state: the durable in-memory view, turn
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
//   - ACP has no steer: a send that lands mid-turn is queued and flushed when
//     the running turn resolves.
//   - `session/prompt` is a long-running request that resolves at end of turn,
//     so its promise IS the turn's lifetime — activity is mirrored from it,
//     never derived by counting frames.
import { appendAttachmentNote } from '@/lib/attachment-note'
import { type MoiContext, appendMoiContext, renderMoiContext } from '@/lib/moi-context'
import { type Part, applyEvent, emptyViewState } from '@/lib/format'
import type { Model, SessionActivity, StreamEvent, ViewState, WorkspaceType } from '@/lib/types'

import {
  type AcpProviderId,
  AssistantTurnAccumulator,
  acpToolCallToTurn,
  acpUsageToTurnMeta,
  replayedUserParts,
  toolTurnId
} from './adapter'
import { type AcpClient, type AcpSpawnSpec, getAcpClient } from './client'
import type {
  AcpModelInfo,
  AcpNewSessionResult,
  AcpPromptBlock,
  PromptResponse,
  SessionUpdate,
  ToolCallUpdate
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
  // Session mode that disables approval prompts, matching moi's
  // bypass-permissions trust model. Applied to every new and resumed session.
  noPromptModeId?: string
  // Does the backend send images as base64 content blocks?
  supportsImages?: boolean
  // How the backend's model catalog becomes picker rows. ACP says nothing
  // about how `name`/`description` are formatted, so a backend that packs
  // extra structure into them (Hermes: the provider) unpacks it here.
  // Defaults to a straight passthrough.
  mapModels?: (models: AcpModelInfo[]) => Model[]
}

type QueuedSend = { blocks: AcpPromptBlock[]; turnId: string }

type SessionRecord = {
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

function recKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

function liveKey(workspaceId: string, sessionId: string): string {
  const direct = recKey(workspaceId, sessionId)
  if (sessions.has(direct)) return direct
  const real = aliases.get(direct)
  return real ? recKey(workspaceId, real) : direct
}

export function getAcpActiveSessions(): {
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}[] {
  const out: { workspaceId: string; sessionId: string; activity: SessionActivity }[] = []
  for (const s of sessions.values()) {
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
  broadcast(rec.workspaceId, {
    type: 'preview',
    sessionId: rec.sessionId,
    messageId: rec.acc.currentId,
    parentToolUseId: null,
    blocks: rec.acc.previewBlocks()
  })
}

function flushAssistant(
  rec: SessionRecord,
  meta?: Parameters<AssistantTurnAccumulator['flush']>[0]
) {
  const turn = rec.acc.flush(meta)
  if (turn) emitTurnEvent(rec, { kind: 'turn', turn })
}

function flushUserChunk(rec: SessionRecord) {
  if (!rec.userChunk) return
  // The chunk is the persisted prompt verbatim; fold the appended machinery
  // (moi-context envelope, attachment note) back out before the text becomes
  // a bubble, and drop the turn when nothing typed remains.
  const parts = replayedUserParts(rec.userChunk)
  rec.userChunk = ''
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
  const turn = acpToolCallToTurn({ update: aliased, sessionId: rec.sessionId, provider, previous })
  const state = turn.parts.find(p => p.type === 'tool-call')
  const settled =
    state?.type === 'tool-call' && (state.call.state === 'success' || state.call.state === 'error')
  if (settled) rec.openToolCalls.delete(aliasedId)
  else rec.openToolCalls.add(aliasedId)
  emitTurnEvent(rec, { kind: 'turn', turn })
}

// Some backends never send a terminal `tool_call_update` for certain tools
// (Hermes drops it for file read/write — NOTES.md §3.4), which would leave the
// card spinning forever. The turn ending is proof the call finished.
function closeOpenToolCalls(rec: SessionRecord) {
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
          p.type === 'tool-call' ? { ...p, call: { ...p.call, state: 'success' as const } } : p
        )
      }
    })
  }
  rec.openToolCalls.clear()
}

function handleSessionUpdate(rec: SessionRecord, update: SessionUpdate, provider: AcpProviderId) {
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
      const block = (update as { content?: { text?: string } }).content
      rec.acc.append('reasoning', block?.text ?? '')
      forwardPreview(rec)
      return
    }
    case 'user_message_chunk': {
      // Replay only — live sends are echoed by moi itself.
      flushAssistant(rec)
      const block = (update as { content?: { text?: string } }).content
      rec.userChunk += block?.text ?? ''
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
  if (method === '__exit') {
    // The agent died (crash or env-change restart). Drop the record so the
    // next message re-resumes against a fresh process.
    setProcessing(rec, false)
    rec.unsubscribe?.()
    sessions.delete(recKey(rec.workspaceId, rec.sessionId))
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

// Apply the no-prompt mode so tool approvals never block a turn.
async function applyNoPromptMode(client: AcpClient, config: AcpProviderConfig, sessionId: string) {
  if (!config.noPromptModeId) return
  try {
    await client.rpc('session/set_mode', { sessionId, modeId: config.noPromptModeId })
  } catch (err) {
    debug(
      `${config.id} set_mode failed session=${sessionId}: ${err instanceof Error ? err.message : err}`
    )
  }
}

async function resumeSession(
  config: AcpProviderConfig,
  input: AcpSpawnContext & { sessionId: string }
): Promise<SessionRecord> {
  const existing = sessions.get(liveKey(input.workspaceId, input.sessionId))
  if (existing) return existing
  const client = await getAcpClient(await config.spawn(input))
  const rec = createRecord({ ...input, client, config })
  // `session/load` replays the whole transcript as session/update
  // notifications on this connection — they flow through the same handler,
  // so flag the record as replaying to suppress previews and title events.
  rec.replaying = true
  try {
    await client.rpc('session/load', {
      sessionId: input.sessionId,
      cwd: input.workspacePath,
      mcpServers: []
    })
  } catch (err) {
    // The record is already registered, and a live record makes every later
    // send skip `session/load` and prompt a session this process never
    // resumed. Drop it so the next send retries the replay.
    rec.unsubscribe?.()
    sessions.delete(recKey(rec.workspaceId, rec.sessionId))
    throw err
  } finally {
    flushAssistant(rec)
    flushUserChunk(rec)
    rec.replaying = false
  }
  await applyNoPromptMode(client, config, input.sessionId)
  return rec
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
  blocks: AcpPromptBlock[]
): Promise<void> {
  setProcessing(rec, true)
  try {
    const client = await getAcpClient(
      await config.spawn({
        workspaceId: rec.workspaceId,
        workspacePath: rec.workspacePath,
        agentId: rec.agentId
      })
    )
    const res = await client.rpc<PromptResponse>('session/prompt', {
      sessionId: rec.sessionId,
      prompt: blocks
    })
    closeOpenToolCalls(rec)
    flushAssistant(rec, {
      ...(res.stopReason ? { stopReason: res.stopReason } : {}),
      ...(acpUsageToTurnMeta(res.usage) ? { usage: acpUsageToTurnMeta(res.usage) } : {})
    })
    if (res.stopReason === 'cancelled') {
      broadcast(rec.workspaceId, { kind: 'stopped', sessionId: rec.sessionId })
    }
    debug(
      `${config.id} turn done ws=${rec.workspaceId} session=${rec.sessionId} stop=${res.stopReason}`
    )
  } catch (err) {
    closeOpenToolCalls(rec)
    flushAssistant(rec)
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'send failed'
    })
    refreshAvailability(rec, config.id)
  } finally {
    const next = rec.queue.shift()
    if (next) {
      void runPrompt(config, rec, next.blocks)
    } else {
      setProcessing(rec, false)
    }
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
    stream?: boolean
    context?: MoiContext
  }
): Promise<void> {
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

  let rec: SessionRecord
  try {
    if (input.isNew) {
      const client = await getAcpClient(await config.spawn(input))
      const created = await client.rpc<AcpNewSessionResult>('session/new', {
        cwd: input.workspacePath,
        mcpServers: []
      })
      const realId = created.sessionId
      const model = input.model ?? created.models?.currentModelId
      if (realId !== input.sessionId) {
        aliases.set(recKey(input.workspaceId, input.sessionId), realId)
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
      rec = createRecord({
        workspaceId: input.workspaceId,
        workspacePath: input.workspacePath,
        agentId: input.agentId,
        sessionId: realId,
        client,
        config,
        model
      })
      await applyNoPromptMode(client, config, realId)
      if (input.model) await setSessionModel(config, rec, client, input.model)
      if (input.model && !(await hasSessionConfig(input.workspacePath, realId))) {
        await saveSessionConfig(input.workspacePath, realId, { model: input.model })
      }
    } else {
      rec = await resumeSession(config, input)
      if (input.model && input.model !== rec.model) {
        const client = await getAcpClient(await config.spawn(input))
        await setSessionModel(config, rec, client, input.model)
      }
    }
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

  rec.stream = input.stream === true

  // Broadcast the user's bubble immediately so every connected tab shows it.
  // ACP never echoes the send back, so this turn is the only record of it —
  // same as the Claude Code path.
  const turnId = input.optimisticId ?? crypto.randomUUID()
  emitTurnEvent(rec, {
    kind: 'turn',
    turn: {
      id: turnId,
      role: 'user',
      origin: { kind: 'user-input' },
      parts,
      timestamp: new Date().toISOString()
    }
  })

  // No steer in ACP: queue behind a running turn instead of racing it.
  if (rec.processing) {
    rec.queue.push({ blocks, turnId })
    debug(`${config.id} queued send ws=${rec.workspaceId} session=${rec.sessionId}`)
    return
  }
  await runPrompt(config, rec, blocks)
}

// Model switches rebuild the agent on some backends; providers that need a
// post-switch fixup (e.g. re-registering MCP servers) do it in their own
// folder by wrapping this.
async function setSessionModel(
  config: AcpProviderConfig,
  rec: SessionRecord,
  client: AcpClient,
  modelId: string
): Promise<void> {
  try {
    await client.rpc('session/set_model', { sessionId: rec.sessionId, modelId })
    rec.model = modelId
    rec.acc.setModel(modelId)
  } catch (err) {
    debug(
      `${config.id} set_model failed session=${rec.sessionId}: ${err instanceof Error ? err.message : err}`
    )
  }
}

export async function interruptAcpRun(
  config: AcpProviderConfig,
  input: { workspaceId: string; sessionId: string }
): Promise<void> {
  const rec = sessions.get(liveKey(input.workspaceId, input.sessionId))
  if (!rec) return
  // Drop anything queued behind the running turn — an interrupt means "stop",
  // not "skip to the next message".
  rec.queue.length = 0
  try {
    const client = await getAcpClient(
      await config.spawn({
        workspaceId: rec.workspaceId,
        workspacePath: rec.workspacePath,
        agentId: rec.agentId
      })
    )
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
  return rec ? viewAsEvents(rec) : null
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
  const rec = sessions.get(key)
  if (!rec) return
  rec.unsubscribe?.()
  sessions.delete(key)
}

// Drop every in-memory session for a workspace (its process is going away).
export function forgetAcpWorkspaceSessions(workspacePath: string): void {
  for (const [key, rec] of sessions) {
    if (rec.workspacePath !== workspacePath) continue
    rec.unsubscribe?.()
    sessions.delete(key)
  }
}

export function forgetAllAcpSessions(): void {
  for (const [key, rec] of sessions) {
    rec.unsubscribe?.()
    sessions.delete(key)
  }
}
