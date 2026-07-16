// Per-(workspaceId, sessionId) live Codex session adapter.
//
// One `codex app-server` process per workspace (see codex.ts) serves every
// thread in it; this module owns the per-thread state: the durable in-memory
// view, turn accounting for the processing spinner, and the mapping of
// `item/*` notifications onto our `StreamEvent`s.
//
// Lifecycle notes:
//   - A brand-new thread is created under the client's temporary uuid, then
//     renamed to the Codex thread id (`session_renamed`) — same flow as the
//     Claude Code and OpenClaw paths.
//   - The app-server persists threads in ~/.codex/sessions and unloads idle
//     ones itself, so there is no eviction machinery here; a cold send
//     re-seeds via `thread/resume`.
//   - Codex natively echoes the user message back with our
//     `clientUserMessageId` as `clientId`, so the optimistic-id rendezvous is
//     first-class (no text matching like OpenClaw needs).
import { appendAttachmentNote } from '@/lib/attachment-note'
import { type Part, applyEvent, emptyViewState } from '@/lib/format'
import type { StreamEvent, ViewState } from '@/lib/types'

import {
  type CodexThread,
  type CodexThreadItem,
  type CodexTokenUsage,
  type CodexTurn,
  codexItemToNotice,
  codexItemToTurn,
  codexThreadToEvents
} from './codex-adapter'
import { type CodexClient, getCodexClient } from './codex'
import { debug } from './debug'
import { broadcast } from './state'
import { hasThreadConfig, renameThreadConfig, saveThreadConfig } from './thread-config'
import {
  type StoredUpload,
  materializeToPath,
  resolveUploads,
  uploadToDisplayPart
} from './uploads'

// moi's trust model matches Claude Code's `bypassPermissions`: the agent acts
// autonomously in the workspace. Codex expresses that as full sandbox access
// with approvals disabled (approval prompts would otherwise arrive as
// server→client requests we have no UI for yet).
const SANDBOX_MODE = 'danger-full-access'
const APPROVAL_POLICY = 'never'

type CodexUserInputItem = { type: 'text'; text: string } | { type: 'image'; url: string }

type SessionRecord = {
  workspaceId: string
  workspacePath: string
  sessionId: string // real Codex thread id once known (rekeyed on rename)
  view: ViewState
  activeTurnId: string | null
  processing: boolean
  // Live token streaming opt-in from the latest chat frame. Codex always
  // streams deltas; this gates whether we forward them as preview frames.
  stream: boolean
  // Cumulative preview text per item id (agentMessage / reasoning summary).
  previews: Map<string, { kind: 'text' | 'reasoning'; text: string }>
  // Usage from `thread/tokenUsage/updated`, folded into the last assistant
  // turn when the turn completes.
  lastUsage: CodexTokenUsage | null
  unsubscribe?: () => void
}

const sessions = new Map<string, SessionRecord>() // key: `${workspaceId}:${sessionId}`
// `${workspaceId}:${tempId}` -> real thread id (see cc-session.ts aliases).
const aliases = new Map<string, string>()

function recKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

function liveKey(workspaceId: string, sessionId: string): string {
  const direct = recKey(workspaceId, sessionId)
  if (sessions.has(direct)) return direct
  const real = aliases.get(direct)
  return real ? recKey(workspaceId, real) : direct
}

export function getCodexRunningSessions(): { workspaceId: string; sessionId: string }[] {
  const out: { workspaceId: string; sessionId: string }[] = []
  for (const s of sessions.values()) {
    if (s.processing) out.push({ workspaceId: s.workspaceId, sessionId: s.sessionId })
  }
  return out
}

function setProcessing(rec: SessionRecord, processing: boolean, turnId: string | null) {
  rec.activeTurnId = turnId
  if (rec.processing === processing) return
  rec.processing = processing
  broadcast(rec.workspaceId, { type: 'status', sessionId: rec.sessionId, processing })
}

function emitTurnEvent(rec: SessionRecord, ev: StreamEvent) {
  rec.view = applyEvent(rec.view, ev)
  broadcast(rec.workspaceId, { ...ev, sessionId: rec.sessionId })
}

function ingestItem(rec: SessionRecord, item: CodexThreadItem) {
  const turn = codexItemToTurn(item, rec.sessionId)
  if (turn) {
    emitTurnEvent(rec, { kind: 'turn', turn })
    return
  }
  const notice = codexItemToNotice(item, rec.sessionId)
  if (notice) emitTurnEvent(rec, { kind: 'notice', notice })
}

function forwardPreview(
  rec: SessionRecord,
  itemId: string,
  kind: 'text' | 'reasoning',
  delta: string
) {
  if (!rec.stream) return
  const entry = rec.previews.get(itemId) ?? { kind, text: '' }
  entry.text += delta
  rec.previews.set(itemId, entry)
  broadcast(rec.workspaceId, {
    type: 'preview',
    sessionId: rec.sessionId,
    messageId: itemId,
    parentToolUseId: null,
    blocks: [{ index: 0, kind, text: entry.text }]
  })
}

// Fold the thread's latest per-turn usage into the newest assistant turn so
// the meta strip can show tokens. Re-emits that turn (upsert-by-id).
function applyUsage(rec: SessionRecord) {
  const last = rec.lastUsage?.last
  if (!last) return
  for (let i = rec.view.turns.length - 1; i >= 0; i--) {
    const t = rec.view.turns[i]
    if (t.role !== 'assistant') continue
    const updated = {
      ...t,
      meta: {
        ...t.meta,
        usage: {
          inputTokens: last.inputTokens,
          outputTokens: last.outputTokens,
          totalTokens: last.totalTokens
        }
      }
    }
    emitTurnEvent(rec, { kind: 'turn', turn: updated })
    return
  }
}

function handleNotification(rec: SessionRecord, method: string, params: Record<string, unknown>) {
  if (method === '__exit') {
    // The app-server died (crash or env-change restart). Drop the record so
    // the next message re-resumes against a fresh process.
    setProcessing(rec, false, null)
    rec.unsubscribe?.()
    sessions.delete(recKey(rec.workspaceId, rec.sessionId))
    return
  }
  if (params.threadId !== rec.sessionId) return

  switch (method) {
    case 'item/started':
    case 'item/completed': {
      const item = params.item as CodexThreadItem | undefined
      if (!item) return
      if (method === 'item/completed') rec.previews.delete(item.id)
      ingestItem(rec, item)
      return
    }
    case 'item/agentMessage/delta': {
      forwardPreview(rec, params.itemId as string, 'text', String(params.delta ?? ''))
      return
    }
    case 'item/reasoning/summaryTextDelta': {
      forwardPreview(rec, params.itemId as string, 'reasoning', String(params.delta ?? ''))
      return
    }
    case 'thread/tokenUsage/updated': {
      rec.lastUsage = (params.tokenUsage ?? null) as CodexTokenUsage | null
      return
    }
    case 'turn/started': {
      const turn = params.turn as CodexTurn | undefined
      setProcessing(rec, true, turn?.id ?? rec.activeTurnId)
      return
    }
    case 'turn/completed': {
      const turn = params.turn as CodexTurn | undefined
      rec.previews.clear()
      applyUsage(rec)
      setProcessing(rec, false, null)
      if (turn?.status === 'failed' && turn.error?.message) {
        broadcast(rec.workspaceId, {
          kind: 'error',
          sessionId: rec.sessionId,
          content: turn.error.message
        })
      }
      return
    }
    case 'error': {
      const err = params.error as { message?: string } | undefined
      const message = err?.message ?? (typeof params.message === 'string' ? params.message : '')
      if (message) {
        broadcast(rec.workspaceId, { kind: 'error', sessionId: rec.sessionId, content: message })
      }
      return
    }
  }
}

function createRecord(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
  client: CodexClient
}): SessionRecord {
  const rec: SessionRecord = {
    workspaceId: input.workspaceId,
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
    view: emptyViewState(),
    activeTurnId: null,
    processing: false,
    stream: false,
    previews: new Map(),
    lastUsage: null
  }
  rec.unsubscribe = input.client.onNotification((method, params) =>
    handleNotification(rec, method, params)
  )
  sessions.set(recKey(rec.workspaceId, rec.sessionId), rec)
  return rec
}

// Seed a record's view from a resumed thread payload (turns included).
function seedFromThread(rec: SessionRecord, thread: CodexThread) {
  let view = emptyViewState()
  for (const ev of codexThreadToEvents(thread)) view = applyEvent(view, ev)
  rec.view = view
}

async function resumeSession(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
}): Promise<SessionRecord> {
  const existing = sessions.get(liveKey(input.workspaceId, input.sessionId))
  if (existing) return existing
  const client = await getCodexClient(input.workspacePath)
  const resumed = await client.rpc<{ thread: CodexThread }>('thread/resume', {
    threadId: input.sessionId
  })
  const rec = createRecord({ ...input, sessionId: resumed.thread.id, client })
  seedFromThread(rec, resumed.thread)
  return rec
}

// Turn a typed text + resolved uploads into Codex input items and the display
// parts for the user's bubble. Images ride inline as data URLs (a documented
// Codex input mode); other files are materialized to a temp path and
// referenced in an attachment note the agent can read.
async function buildUserInput(
  text: string,
  uploads: StoredUpload[]
): Promise<{ input: CodexUserInputItem[]; parts: Part[] }> {
  const parts: Part[] = []
  for (const u of uploads) {
    const part = uploadToDisplayPart(u)
    if (part) parts.push(part)
  }
  if (text) parts.push({ type: 'text', text })

  const input: CodexUserInputItem[] = []
  for (const u of uploads) {
    if (u.kind === 'image' && u.data) {
      input.push({ type: 'image', url: `data:${u.mediaType};base64,${u.data.toString('base64')}` })
    }
  }
  const files: { filename: string; path: string }[] = []
  for (const u of uploads) {
    if (u.kind !== 'file') continue
    const p = await materializeToPath(u)
    if (p) files.push({ filename: u.filename, path: p })
  }
  const agentText = appendAttachmentNote(text, files)
  if (agentText) input.push({ type: 'text', text: agentText })
  return { input, parts }
}

export async function sendCodexMessage(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  content: string
  attachments?: string[]
  optimisticId?: string
  model?: string
  effort?: string
  stream?: boolean
}): Promise<void> {
  const uploads = input.attachments?.length
    ? resolveUploads(input.workspaceId, input.attachments)
    : []
  if (!input.content && uploads.length === 0) return
  const { input: userInput, parts } = await buildUserInput(input.content, uploads)
  if (userInput.length === 0) return

  let rec: SessionRecord
  try {
    if (input.isNew) {
      const client = await getCodexClient(input.workspacePath)
      const started = await client.rpc<{ thread: CodexThread }>('thread/start', {
        cwd: input.workspacePath,
        sandbox: SANDBOX_MODE,
        approvalPolicy: APPROVAL_POLICY,
        ...(input.model ? { model: input.model } : {})
      })
      const realId = started.thread.id
      if (realId !== input.sessionId) {
        aliases.set(recKey(input.workspaceId, input.sessionId), realId)
        broadcast(input.workspaceId, {
          type: 'session_renamed',
          from: input.sessionId,
          to: realId
        })
        await renameThreadConfig(input.workspacePath, input.sessionId, realId)
      }
      rec = createRecord({
        workspaceId: input.workspaceId,
        workspacePath: input.workspacePath,
        sessionId: realId,
        client
      })
      if ((input.model || input.effort) && !(await hasThreadConfig(input.workspacePath, realId))) {
        await saveThreadConfig(input.workspacePath, realId, {
          model: input.model,
          effort: input.effort
        })
      }
    } else {
      rec = await resumeSession(input)
    }
  } catch (err) {
    broadcast(input.workspaceId, {
      kind: 'error',
      sessionId: input.sessionId,
      content: err instanceof Error ? err.message : 'failed to start codex session'
    })
    return
  }

  rec.stream = input.stream === true

  // Broadcast the user's bubble immediately so every connected tab shows it;
  // the Codex echo (`userMessage` item) reuses this id via `clientId` and
  // upserts in place.
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

  setProcessing(rec, true, rec.activeTurnId)
  try {
    const client = await getCodexClient(input.workspacePath)
    const turnParams = {
      threadId: rec.sessionId,
      clientUserMessageId: turnId,
      input: userInput,
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {})
    }
    if (rec.activeTurnId) {
      // A turn is running — steer the new input into it. If the turn ended
      // in the race window, fall back to starting a fresh turn.
      try {
        await client.rpc('turn/steer', {
          threadId: rec.sessionId,
          clientUserMessageId: turnId,
          input: userInput,
          expectedTurnId: rec.activeTurnId
        })
      } catch {
        const res = await client.rpc<{ turn: CodexTurn }>('turn/start', turnParams)
        setProcessing(rec, true, res.turn.id)
      }
    } else {
      const res = await client.rpc<{ turn: CodexTurn }>('turn/start', turnParams)
      setProcessing(rec, true, res.turn.id)
    }
    debug(`codex send ws=${rec.workspaceId} thread=${rec.sessionId} turn=${rec.activeTurnId}`)
  } catch (err) {
    setProcessing(rec, false, null)
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'send failed'
    })
  }
}

export async function interruptCodexRun(input: {
  workspaceId: string
  sessionId: string
}): Promise<void> {
  const rec = sessions.get(liveKey(input.workspaceId, input.sessionId))
  if (!rec) return
  try {
    if (rec.activeTurnId) {
      const client = await getCodexClient(rec.workspacePath)
      await client.rpc('turn/interrupt', {
        threadId: rec.sessionId,
        turnId: rec.activeTurnId
      })
    }
    broadcast(rec.workspaceId, { kind: 'stopped', sessionId: rec.sessionId })
    setProcessing(rec, false, null)
  } catch (err) {
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'interrupt failed'
    })
  }
}

export function viewAsEvents(rec: SessionRecord): StreamEvent[] {
  const evs: StreamEvent[] = []
  for (const turn of rec.view.turns) evs.push({ kind: 'turn', turn })
  for (const notice of rec.view.notices) evs.push({ kind: 'notice', notice })
  return evs
}

// Read-side hook for the REST events endpoint (mirrors the OpenClaw path):
// return the live view when we hold one so REST + WS stay in agreement.
export function getLiveCodexEvents(workspaceId: string, sessionId: string): StreamEvent[] | null {
  const rec = sessions.get(liveKey(workspaceId, sessionId))
  return rec ? viewAsEvents(rec) : null
}

// Cold-load: resume the thread (also subscribing it on our connection) and
// return its events, so subsequent WS frames upsert into the same view.
export async function ensureCodexSessionLive(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
}): Promise<StreamEvent[]> {
  const rec = await resumeSession(input)
  return viewAsEvents(rec)
}
