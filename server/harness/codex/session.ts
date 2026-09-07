// Live state per (workspaceId, sessionId): display history, native lifecycle,
// pending input, and previews. client.ts owns the shared workspace process;
// Codex owns durable history. See NOTES.md for ordering and recovery rules.
import { appendAttachmentNote } from '@/lib/attachment-note'
import { buildSessionTitleSource } from '../session-title'
import {
  type MoiContext,
  appendMoiContext,
  renderMoiContext,
  renderMoiContextBody
} from '@/lib/moi-context'
import { type Part, type SubagentRecord, type Turn, applyEvent, emptyViewState } from '@/lib/format'
import type { SessionActivity, StreamEvent, ViewState } from '@/lib/types'

import {
  type CodexThread,
  type CodexThreadItem,
  type CodexTokenUsage,
  type CodexTurn,
  type SubagentReplay,
  codexServiceTierForFastMode,
  codexItemToNotice,
  codexItemToTurn,
  codexThreadToEvents,
  withCodexTurnDuration
} from './adapter'
import {
  type CodexClient,
  getCodexClient,
  getCodexModelCatalog,
  interruptCodexTurn,
  readSubagentRecords
} from './client'
import { CodexRpcError } from './transport'
import { CodexInputRequests } from './input-requests'
import {
  CODEX_LOCAL_CONTROL_CONTEXT,
  CODEX_LOCAL_CONTROL_FALLBACK,
  CODEX_THREAD_ACCESS,
  CODEX_TURN_ACCESS
} from './permissions'
import { generateCodexSessionTitle, renameCodexSessionIfUnchanged } from './session-title'
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

type CodexUserInputItem = { type: 'text'; text: string } | { type: 'image'; url: string }

// A child agent thread nested under this session (Codex multi-agent): the
// child's items stream on the same connection under its own threadId, and we
// fold them into a SubagentRecord on the parent's `subagent_activity` card.
type ChildThread = {
  toolCallId: string // the parent card carrying the nested transcript
  record: SubagentRecord
}

type SessionRecord = {
  client: CodexClient
  lastTouched: number
  inputs: CodexInputRequests
  workspaceId: string
  workspacePath: string
  sessionId: string // real Codex thread id once known (rekeyed on rename)
  view: ViewState
  activeTurnId: string | null
  processing: boolean
  waiting: boolean
  activity: SessionActivity
  model?: string
  // Live token streaming opt-in from the latest chat frame. Codex always
  // streams deltas; this gates whether we forward them as preview frames.
  stream: boolean
  // Cumulative preview text per item id (agentMessage / reasoning summary).
  previews: Map<string, { kind: 'text' | 'reasoning'; text: string }>
  // Usage from `thread/tokenUsage/updated`, folded into the last assistant
  // turn when the turn completes.
  lastUsage: CodexTokenUsage | null
  usageTurnId: string | null
  completedTurns: Set<string>
  bufferedNotifications: [string, Record<string, unknown>][] | null
  previewTimer: Timer | null
  dirtyPreviews: Set<string>
  commandOutput: Map<string, string>
  commandOutputTimer: Timer | null
  // Child agent threads keyed by their thread id (see ChildThread).
  children: Map<string, ChildThread>
  refreshSessionsOnTurnComplete: boolean
  sessionTitleSource: string | undefined
  sessionTitleAbort: AbortController | null
  unsubscribe?: () => void
}

const sessions = new Map<string, SessionRecord>() // key: `${workspaceId}:${sessionId}`
// `${workspaceId}:${tempId}` -> native thread id after session_renamed.
const aliases = new Map<string, string>()
// The UI can answer native tool questions in ordinary chat, not just Plan
// mode. Keep this override local to moi's threads; never rewrite user config.
const CODEX_INTERACTION_CONFIG = { 'features.default_mode_request_user_input': true }
const resumes = new Map<string, Promise<SessionRecord>>()
type SendLane = { tail: Promise<void>; generation: number }
const sendLanes = new Map<string, SendLane>()
const SESSION_IDLE_TTL_MS = 30 * 60_000

// The provider keeps durable history. Release transcript copies and listeners
// from chats that nobody has used recently; opening one subscribes again.
const evictionTimer = setInterval(() => {
  const cutoff = Date.now() - SESSION_IDLE_TTL_MS
  for (const [key, rec] of sessions) {
    if (
      rec.lastTouched > cutoff ||
      rec.processing ||
      rec.inputs.hasPending ||
      rec.bufferedNotifications ||
      rec.sessionTitleAbort
    )
      continue
    rec.unsubscribe?.()
    clearPreviews(rec)
    sessions.delete(key)
    const lane = sendLanes.get(key)
    for (const [laneKey, candidate] of sendLanes) {
      if (candidate === lane) sendLanes.delete(laneKey)
    }
    for (const [alias, sessionId] of aliases) {
      if (recKey(rec.workspaceId, sessionId) === key && alias.startsWith(`${rec.workspaceId}:`))
        aliases.delete(alias)
    }
    void rec.client.rpc('thread/unsubscribe', { threadId: rec.sessionId }).catch(() => {})
  }
}, 60_000)
evictionTimer.unref()

function sendLane(workspaceId: string, sessionId: string): SendLane {
  const key = liveKey(workspaceId, sessionId)
  let lane = sendLanes.get(key)
  if (!lane) {
    lane = { tail: Promise.resolve(), generation: 0 }
    sendLanes.set(key, lane)
  }
  return lane
}

function recKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

function liveKey(workspaceId: string, sessionId: string): string {
  const direct = recKey(workspaceId, sessionId)
  if (sessions.has(direct)) return direct
  const real = aliases.get(direct)
  return real ? recKey(workspaceId, real) : direct
}

export type CodexActiveSession = {
  workspaceId: string
  workspacePath: string
  sessionId: string
  activity: SessionActivity
}

export function getCodexActiveSessions(): CodexActiveSession[] {
  const out: CodexActiveSession[] = []
  for (const s of sessions.values()) {
    // Tool questions can block even though permission approvals are automatic.
    if (s.processing || s.inputs.blocking) {
      out.push({
        workspaceId: s.workspaceId,
        workspacePath: s.workspacePath,
        sessionId: s.sessionId,
        activity: sessionActivity(s)
      })
    }
  }
  return out
}

// The workspace connector panel has no selected-chat parameter. Use the most
// recently observed loaded chat to obtain runtime health instead of auth alone.
export function getLatestCodexSessionId(workspaceId: string): string | undefined {
  let latest: SessionRecord | undefined
  for (const rec of sessions.values()) {
    if (
      rec.workspaceId === workspaceId &&
      !rec.bufferedNotifications &&
      (!latest || rec.lastTouched >= latest.lastTouched)
    )
      latest = rec
  }
  return latest?.sessionId
}

function setProcessing(rec: SessionRecord, processing: boolean, turnId: string | null) {
  rec.activeTurnId = turnId
  rec.processing = processing
  if (!processing) rec.waiting = false
  publishActivity(rec)
}

function sessionActivity(rec: SessionRecord): SessionActivity {
  return rec.inputs.blocking || rec.waiting
    ? 'requires-action'
    : rec.processing
      ? 'running'
      : 'idle'
}

function publishActivity(rec: SessionRecord) {
  const activity = sessionActivity(rec)
  if (rec.activity === activity) return
  rec.activity = activity
  broadcast(rec.workspaceId, {
    type: 'status',
    sessionId: rec.sessionId,
    activity
  })
}

function waitingOnInput(status: CodexThread['status']): boolean {
  return (
    status?.type === 'active' &&
    Boolean(
      status.activeFlags?.some(
        flag => flag === 'waitingOnApproval' || flag === 'waitingOnUserInput'
      )
    )
  )
}

function releaseSession(rec: SessionRecord, reason: string) {
  flushCommandOutput(rec)
  clearPreviews(rec)
  settleTools(rec, reason)
  rec.inputs.cancel()
  setProcessing(rec, false, null)
  rec.sessionTitleAbort?.abort()
  rec.sessionTitleAbort = null
  rec.unsubscribe?.()
  const key = recKey(rec.workspaceId, rec.sessionId)
  if (sessions.get(key) === rec) sessions.delete(key)
}

function emitTurnEvent(rec: SessionRecord, ev: StreamEvent) {
  rec.view = applyEvent(rec.view, ev)
  broadcast(rec.workspaceId, { ...ev, sessionId: rec.sessionId })
}

function ingestItem(rec: SessionRecord, item: CodexThreadItem) {
  const turn = codexItemToTurn(item, rec.sessionId)
  if (turn) {
    turn.timestamp =
      rec.view.turns.find(existing => existing.id === turn.id)?.timestamp ??
      new Date().toISOString()
    // subAgentActivity announces a child agent thread: register it so its
    // item stream (arriving under `agentThreadId`) nests into this card's
    // SubagentRecord, CC-style.
    if (item.type === 'subAgentActivity' && item.agentThreadId) {
      const existing = rec.children.get(item.agentThreadId)
      const child: ChildThread = existing ?? {
        toolCallId: item.id,
        record: {
          taskId: item.agentThreadId,
          description: item.agentPath?.split('/').pop() || 'sub-agent',
          progress: [],
          status: 'running',
          transcript: []
        }
      }
      if (item.kind === 'completed' || item.kind === 'closed') child.record.status = 'completed'
      if (item.kind === 'failed') child.record.status = 'failed'
      rec.children.set(item.agentThreadId, child)
      attachSubagent(turn, child.record)
    }
    emitTurnEvent(rec, { kind: 'turn', turn })
    return
  }
  const notice = codexItemToNotice(item, rec.sessionId)
  if (notice) emitTurnEvent(rec, { kind: 'notice', notice })
}

// Fold the child's SubagentRecord into the tool-call part of its parent card.
function attachSubagent(turn: Turn, record: SubagentRecord) {
  const part = turn.parts.find(p => p.type === 'tool-call')
  if (part?.type === 'tool-call') part.call.subagent = record
}

// A child-thread notification: upsert the child's items into its
// SubagentRecord transcript and re-emit the parent card so the nested lane
// updates live.
function handleChildNotification(
  rec: SessionRecord,
  child: ChildThread,
  childThreadId: string,
  method: string,
  params: Record<string, unknown>
) {
  if (method === 'item/started' || method === 'item/completed') {
    const item = params.item as CodexThreadItem | undefined
    if (!item) return
    // The child's own `subAgentActivity` (its send-back to the parent) would
    // render as a cryptic nested agent card — skip it, matching the replay
    // path (childThreadToSubagentRecord).
    if (item.type === 'subAgentActivity') return
    const turn = codexItemToTurn(item, childThreadId)
    if (!turn) return
    const idx = child.record.transcript.findIndex(t => t.id === turn.id)
    if (idx >= 0) child.record.transcript[idx] = turn
    else child.record.transcript.push(turn)
    // Progress: keep the latest assistant text as the "what it's doing" line.
    if (method === 'item/completed' && item.type === 'agentMessage' && item.text) {
      child.record.progress = [item.text.slice(0, 200)]
    }
  } else if (method === 'thread/tokenUsage/updated') {
    const usage = (params.tokenUsage ?? null) as CodexTokenUsage | null
    if (usage?.total?.totalTokens !== undefined) {
      child.record.usage = { ...child.record.usage, totalTokens: usage.total.totalTokens }
    }
  } else if (method === 'turn/completed') {
    const turn = params.turn as CodexTurn | undefined
    if (turn?.status === 'failed') child.record.status = 'failed'
    else if (child.record.status === 'running') child.record.status = 'completed'
  } else {
    return
  }
  // Re-emit the parent card so the nested transcript renders live.
  const owner = rec.view.turns.find(t =>
    t.parts.some(p => p.type === 'tool-call' && p.call.toolCallId === child.toolCallId)
  )
  if (owner) {
    attachSubagent(owner, child.record)
    emitTurnEvent(rec, { kind: 'turn', turn: owner })
  }
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
  rec.dirtyPreviews.add(itemId)
  // Coalesce tokens to reduce repeated cumulative payloads and client updates.
  rec.previewTimer ??= setTimeout(() => flushPreviews(rec), 40)
}

function flushPreviews(rec: SessionRecord) {
  if (rec.previewTimer) clearTimeout(rec.previewTimer)
  rec.previewTimer = null
  for (const itemId of rec.dirtyPreviews) {
    const entry = rec.previews.get(itemId)
    if (!entry) continue
    broadcast(rec.workspaceId, {
      type: 'preview',
      sessionId: rec.sessionId,
      messageId: itemId,
      parentToolUseId: null,
      blocks: [{ index: 0, kind: entry.kind, text: entry.text }]
    })
  }
  rec.dirtyPreviews.clear()
}

function clearPreviews(rec: SessionRecord) {
  if (rec.previewTimer) clearTimeout(rec.previewTimer)
  rec.previewTimer = null
  rec.dirtyPreviews.clear()
  rec.previews.clear()
}

const LIVE_OUTPUT_LIMIT = 64 * 1024

function flushCommandOutput(rec: SessionRecord) {
  if (rec.commandOutputTimer) clearTimeout(rec.commandOutputTimer)
  rec.commandOutputTimer = null
  for (const [itemId, delta] of rec.commandOutput) {
    const owner = rec.view.turns.find(turn =>
      turn.parts.some(
        part =>
          part.type === 'tool-call' &&
          part.call.toolCallId === itemId &&
          part.call.name === 'exec' &&
          part.call.state === 'running'
      )
    )
    if (!owner) continue
    const parts = owner.parts.map(part => {
      if (
        part.type !== 'tool-call' ||
        part.call.toolCallId !== itemId ||
        part.call.state !== 'running'
      )
        return part
      const output = `${typeof part.call.output === 'string' ? part.call.output : ''}${delta}`
      return {
        ...part,
        call: {
          ...part.call,
          output:
            output.length > LIVE_OUTPUT_LIMIT
              ? `[Earlier live output omitted]\n${output.slice(-LIVE_OUTPUT_LIMIT)}`
              : output
        }
      }
    })
    emitTurnEvent(rec, { kind: 'turn', turn: { ...owner, parts } })
  }
  rec.commandOutput.clear()
}

function clearCommandOutput(rec: SessionRecord) {
  if (rec.commandOutputTimer) clearTimeout(rec.commandOutputTimer)
  rec.commandOutputTimer = null
  rec.commandOutput.clear()
}

function settleTools(rec: SessionRecord, reason: string) {
  for (const turn of rec.view.turns) {
    let changed = false
    const parts = turn.parts.map(part => {
      if (
        part.type !== 'tool-call' ||
        !['running', 'pending', 'approval-pending'].includes(part.call.state)
      )
        return part
      changed = true
      return { ...part, call: { ...part.call, state: 'error' as const, errorText: reason } }
    })
    if (changed) emitTurnEvent(rec, { kind: 'turn', turn: { ...turn, parts } })
  }
}

// Fold native completion metadata into the newest assistant turn so replay and
// live rendering use the same display shape. Re-emits that turn (upsert-by-id).
function applyCompletionMeta(
  rec: SessionRecord,
  turnId: string | undefined,
  durationMs: number | null | undefined
) {
  const last = rec.usageTurnId === turnId ? rec.lastUsage?.last : undefined
  for (let i = rec.view.turns.length - 1; i >= 0; i--) {
    const t = rec.view.turns[i]
    if (t.role === 'user' && t.origin.kind === 'user-input') return
    if (t.role !== 'assistant') continue
    let updated = withCodexTurnDuration(t, durationMs)
    if (last) {
      updated = {
        ...updated,
        meta: {
          ...updated.meta,
          usage: {
            inputTokens: last.inputTokens,
            outputTokens: last.outputTokens,
            totalTokens: last.totalTokens
          }
        }
      }
    }
    if (updated === t) return
    emitTurnEvent(rec, { kind: 'turn', turn: updated })
    return
  }
}

// A failed send may reflect an external logout. Refresh the cached banner now.
function refreshAvailability(workspaceId: string, workspacePath: string) {
  void agentStore.refresh({ id: workspaceId, path: workspacePath, type: 'codex' })
}

function handleNotification(rec: SessionRecord, method: string, params: Record<string, unknown>) {
  if (method === '__exit') {
    // The app-server died (crash or env-change restart). Drop the record so
    // the next message re-resumes against a fresh process.
    if (rec.processing)
      broadcast(rec.workspaceId, {
        kind: 'error',
        sessionId: rec.sessionId,
        content:
          typeof params.message === 'string'
            ? params.message
            : 'Codex disconnected. Send another message to resume this chat.'
      })
    releaseSession(rec, 'Codex disconnected before this tool returned a result')
    return
  }
  if (rec.bufferedNotifications) {
    rec.bufferedNotifications.push([method, params])
    return
  }
  const mcpFailure = method === 'mcpServer/startupStatus/updated' && params.status === 'failed'
  if (
    (method === 'warning' || method === 'configWarning' || mcpFailure) &&
    (params.threadId == null || params.threadId === rec.sessionId)
  ) {
    const message = mcpFailure
      ? `MCP ${String(params.name ?? 'server')} failed to start${typeof params.error === 'string' ? `: ${params.error}` : ''}`
      : method === 'warning'
        ? params.message
        : params.summary
    if (typeof message === 'string')
      emitTurnEvent(rec, {
        kind: 'notice',
        notice: {
          id: `codex:${rec.sessionId}:warning:${message}`,
          kind: 'warning',
          at: new Date().toISOString(),
          message
        }
      })
    return
  }
  // Child agent threads stream on the same connection under their own ids —
  // route them into the parent's SubagentRecord.
  if (typeof params.threadId === 'string' && params.threadId !== rec.sessionId) {
    const child = rec.children.get(params.threadId)
    if (child) handleChildNotification(rec, child, params.threadId, method, params)
    return
  }
  if (params.threadId !== rec.sessionId) return
  rec.lastTouched = Date.now()

  switch (method) {
    case 'model/rerouted': {
      if (typeof params.toModel !== 'string') return
      rec.model = params.toModel
      emitTurnEvent(rec, {
        kind: 'notice',
        notice: {
          id: `codex:${rec.sessionId}:model:${String(params.turnId)}`,
          kind: 'model-change',
          at: new Date().toISOString(),
          model: params.toModel,
          ...(typeof params.fromModel === 'string' ? { prev: params.fromModel } : {})
        }
      })
      return
    }
    case 'turn/plan/updated': {
      if (!Array.isArray(params.plan) || typeof params.turnId !== 'string') return
      const steps = params.plan.flatMap((step: unknown) => {
        if (!step || typeof step !== 'object' || !('step' in step) || typeof step.step !== 'string')
          return []
        const status = 'status' in step ? step.status : undefined
        return [
          `${status === 'completed' ? '[x]' : status === 'inProgress' ? '[→]' : '[ ]'} ${step.step}`
        ]
      })
      ingestItem(rec, {
        type: 'plan',
        id: `${params.turnId}:plan`,
        text: [typeof params.explanation === 'string' ? params.explanation : '', ...steps]
          .filter(Boolean)
          .join('\n')
      })
      return
    }
    case 'item/started':
    case 'item/completed': {
      const item = params.item as CodexThreadItem | undefined
      if (!item) return
      if (method === 'item/completed') {
        rec.commandOutput.delete(item.id)
        rec.previews.delete(item.id)
        rec.dirtyPreviews.delete(item.id)
      }
      ingestItem(rec, item)
      return
    }
    case 'item/commandExecution/outputDelta': {
      if (typeof params.itemId !== 'string' || typeof params.delta !== 'string') return
      const output = (rec.commandOutput.get(params.itemId) ?? '') + params.delta
      rec.commandOutput.set(
        params.itemId,
        output.length > LIVE_OUTPUT_LIMIT
          ? `[Earlier live output omitted]\n${output.slice(-LIVE_OUTPUT_LIMIT)}`
          : output
      )
      rec.commandOutputTimer ??= setTimeout(() => flushCommandOutput(rec), 40)
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
    case 'item/reasoning/summaryPartAdded': {
      // Match replay's summary separator without adding a leading blank line.
      if (rec.previews.has(params.itemId as string)) {
        forwardPreview(rec, params.itemId as string, 'reasoning', '\n')
      }
      return
    }
    case 'thread/tokenUsage/updated': {
      rec.lastUsage = (params.tokenUsage ?? null) as CodexTokenUsage | null
      rec.usageTurnId = typeof params.turnId === 'string' ? params.turnId : rec.activeTurnId
      return
    }
    case 'turn/started': {
      const turn = params.turn as CodexTurn | undefined
      if (turn?.id && rec.completedTurns.has(turn.id)) return
      if (rec.activeTurnId !== turn?.id) {
        rec.lastUsage = null
        rec.usageTurnId = null
      }
      setProcessing(rec, true, turn?.id ?? rec.activeTurnId)
      return
    }
    case 'turn/completed': {
      const turn = params.turn as CodexTurn | undefined
      if (turn?.id && rec.completedTurns.has(turn.id)) return
      if (turn?.id) {
        rec.inputs.cancelTurn(turn.id)
        rec.completedTurns.add(turn.id)
        if (rec.completedTurns.size > 64)
          rec.completedTurns.delete(rec.completedTurns.values().next().value!)
      }
      // A delayed completion from an older turn must not stop a newer one.
      if (rec.activeTurnId && turn?.id && rec.activeTurnId !== turn.id) return
      flushCommandOutput(rec)
      for (const item of turn?.items ?? []) ingestItem(rec, item)
      settleTools(
        rec,
        turn?.status === 'interrupted'
          ? 'Stopped'
          : 'Codex ended the turn before this tool returned a result'
      )
      clearPreviews(rec)
      applyCompletionMeta(rec, turn?.id, turn?.durationMs)
      setProcessing(rec, false, null)
      if (rec.refreshSessionsOnTurnComplete) {
        rec.refreshSessionsOnTurnComplete = false
        broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
      }
      if (turn?.status === 'failed' && turn.error?.message) {
        broadcast(rec.workspaceId, {
          kind: 'error',
          sessionId: rec.sessionId,
          content: turn.error.message
        })
        refreshAvailability(rec.workspaceId, rec.workspacePath)
      }
      // An externally-interrupted turn otherwise ends silently, identical to a
      // clean completion — surface the stop so the client can render it.
      if (turn?.status === 'interrupted') {
        broadcast(rec.workspaceId, { kind: 'stopped', sessionId: rec.sessionId })
      }
      return
    }
    case 'error': {
      const err = params.error as { message?: string } | undefined
      const message = err?.message ?? (typeof params.message === 'string' ? params.message : '')
      if (params.willRetry === true) {
        // The provider still owns a running turn and will retry it. Do not
        // expose a Retry button that would submit the user's message again.
        emitTurnEvent(rec, {
          kind: 'notice',
          notice: {
            id: `codex:${rec.sessionId}:retry:${String(params.turnId ?? rec.activeTurnId)}`,
            kind: 'api-retry',
            at: new Date().toISOString(),
            error: message
          }
        })
        return
      }
      if (params.turnId && rec.activeTurnId && params.turnId !== rec.activeTurnId) return
      if (message) {
        broadcast(rec.workspaceId, { kind: 'error', sessionId: rec.sessionId, content: message })
        refreshAvailability(rec.workspaceId, rec.workspacePath)
      }
      // A top-level error without a following turn/completed would otherwise
      // leave the session busy forever — the error is terminal for the turn.
      setProcessing(rec, false, null)
      clearPreviews(rec)
      flushCommandOutput(rec)
      settleTools(rec, message || 'Codex ended the turn before this tool returned a result')
      rec.inputs.cancel()
      return
    }
    case 'thread/status/changed': {
      const status = params.status as CodexThread['status']
      rec.waiting = waitingOnInput(status)
      if (status?.type === 'active') setProcessing(rec, true, rec.activeTurnId)
      else if (status?.type === 'notLoaded') {
        releaseSession(rec, 'Codex unloaded this chat')
        broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
      } else if (status?.type === 'idle' || status?.type === 'systemError') {
        flushCommandOutput(rec)
        setProcessing(rec, false, null)
        clearPreviews(rec)
        if (status.type !== 'idle') rec.inputs.cancel()
      }
      return
    }
    case 'thread/closed':
    case 'thread/archived':
    case 'thread/deleted': {
      releaseSession(rec, 'Codex closed this chat')
      broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
      return
    }
    case 'thread/unarchived':
    case 'thread/name/updated': {
      broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
      return
    }
    case 'serverRequest/resolved': {
      if (typeof params.requestId === 'string' || typeof params.requestId === 'number')
        rec.inputs.resolved(params.requestId)
      return
    }
    // Reuse the notice id so completion updates the hook's started row.
    case 'hook/started':
    case 'hook/completed': {
      const run = params.run as
        | {
            id?: string
            eventName?: string
            status?: string
            entries?: { kind?: string; text?: string }[]
          }
        | undefined
      if (!run?.id) return
      const output = (run.entries ?? [])
        .map(e => e.text)
        .filter(Boolean)
        .join('\n')
      emitTurnEvent(rec, {
        kind: 'notice',
        notice: {
          id: `codex:${rec.sessionId}:hook:${run.id}`,
          kind: 'hook',
          at: new Date().toISOString(),
          hookId: run.id,
          hookName: run.eventName ?? 'hook',
          event: run.eventName ?? '',
          status: method === 'hook/started' ? 'started' : 'response',
          ...(output ? { output } : {}),
          ...(method === 'hook/completed'
            ? { outcome: run.status === 'failed' ? ('error' as const) : ('success' as const) }
            : {})
        }
      })
      return
    }
  }
}

function isCurrentCodexSession(rec: SessionRecord, abort: AbortController): boolean {
  return !abort.signal.aborted && sessions.get(recKey(rec.workspaceId, rec.sessionId)) === rec
}

function startCodexSessionTitleJob(rec: SessionRecord, client: CodexClient) {
  if (!rec.sessionTitleSource) return
  const source = rec.sessionTitleSource
  rec.sessionTitleSource = undefined
  const abort = new AbortController()
  rec.sessionTitleAbort = abort

  void (async () => {
    try {
      const title = await generateCodexSessionTitle({
        source,
        abortController: abort
      })
      if (!title || !isCurrentCodexSession(rec, abort)) return

      const renamed = await renameCodexSessionIfUnchanged({
        client,
        threadId: rec.sessionId,
        title,
        isCurrent: () => isCurrentCodexSession(rec, abort)
      })
      if (!renamed || !isCurrentCodexSession(rec, abort)) return
      broadcast(rec.workspaceId, { type: 'sessions_changed', sessionId: rec.sessionId })
      debug(
        `codex session title ws=${rec.workspaceId} thread=${rec.sessionId} title=${JSON.stringify(title)}`
      )
    } catch (err) {
      debug(
        `codex session title failed ws=${rec.workspaceId} thread=${rec.sessionId}: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      if (rec.sessionTitleAbort === abort) rec.sessionTitleAbort = null
    }
  })()
}

function createRecord(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
  client: CodexClient
  refreshSessionsOnTurnComplete?: boolean
  sessionTitleSource?: string
}): SessionRecord {
  const inputs = new CodexInputRequests(notice => {
    emitTurnEvent(rec, { kind: 'notice', notice })
    publishActivity(rec)
  })
  const rec: SessionRecord = {
    client: input.client,
    lastTouched: Date.now(),
    inputs,
    workspaceId: input.workspaceId,
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
    view: emptyViewState(),
    activeTurnId: null,
    processing: false,
    waiting: false,
    activity: 'idle',
    stream: false,
    previews: new Map(),
    children: new Map(),
    lastUsage: null,
    usageTurnId: null,
    completedTurns: new Set(),
    bufferedNotifications: null,
    previewTimer: null,
    dirtyPreviews: new Set(),
    commandOutput: new Map(),
    commandOutputTimer: null,
    refreshSessionsOnTurnComplete: input.refreshSessionsOnTurnComplete === true,
    sessionTitleSource: input.sessionTitleSource,
    sessionTitleAbort: null
  }
  const unsubscribeNotifications = input.client.onNotification((method, params) =>
    handleNotification(rec, method, params)
  )
  const unsubscribeRequests = input.client.onRequest((method, params, id) => {
    if (params.threadId !== rec.sessionId || method !== 'item/tool/requestUserInput')
      return undefined
    return inputs.request(params, id)
  })
  rec.unsubscribe = () => {
    unsubscribeNotifications()
    unsubscribeRequests()
  }
  sessions.set(recKey(rec.workspaceId, rec.sessionId), rec)
  return rec
}

// Seed a record's view from a resumed thread payload (turns included).
function seedFromThread(
  rec: SessionRecord,
  thread: CodexThread,
  subagents?: Map<string, SubagentReplay>
) {
  let view = emptyViewState()
  for (const ev of codexThreadToEvents(thread, subagents)) view = applyEvent(view, ev)
  for (const notice of rec.view.notices) view = applyEvent(view, { kind: 'notice', notice })
  rec.view = view
}

type ResumeInput = { workspaceId: string; workspacePath: string; sessionId: string }

async function resumeSession(input: ResumeInput): Promise<SessionRecord> {
  const key = liveKey(input.workspaceId, input.sessionId)
  const pending = resumes.get(key)
  if (pending) return pending
  const existing = sessions.get(key)
  if (existing) return existing
  const loading = (async () => {
    const client = await getCodexClient(input.workspacePath)
    // Subscribe before resuming. Live frames may arrive before the RPC reply,
    // or while child transcripts are loading; replay them after the snapshot.
    const rec = createRecord({ ...input, client })
    rec.bufferedNotifications = []
    try {
      const resumed = await client.rpc<{ thread: CodexThread; model?: string }>('thread/resume', {
        threadId: input.sessionId,
        config: CODEX_INTERACTION_CONFIG,
        ...CODEX_THREAD_ACCESS
      })
      const subagents = await readSubagentRecords(client, resumed.thread)
      rec.model = resumed.model
      if (!client.isAlive()) throw new Error('Codex disconnected while resuming this chat')
      for (const [childId, sub] of subagents) rec.children.set(childId, sub)
      seedFromThread(rec, resumed.thread, subagents)
      const active = resumed.thread.turns?.findLast(turn => turn.status === 'inProgress')
      rec.waiting = waitingOnInput(resumed.thread.status)
      setProcessing(
        rec,
        Boolean(active) || resumed.thread.status?.type === 'active',
        active?.id ?? null
      )
      const buffered = rec.bufferedNotifications
      rec.bufferedNotifications = null
      for (const [method, params] of buffered) handleNotification(rec, method, params)
      if (sessions.get(key) !== rec) throw new Error('Codex closed this chat while resuming it')
      return rec
    } catch (error) {
      rec.inputs.cancel()
      clearPreviews(rec)
      clearCommandOutput(rec)
      rec.unsubscribe?.()
      if (sessions.get(key) === rec) sessions.delete(key)
      throw error
    }
  })()
  resumes.set(key, loading)
  try {
    return await loading
  } finally {
    if (resumes.get(key) === loading) resumes.delete(key)
  }
}

// Images send inline; other uploads become readable path notes. Display parts
// retain the original attachment metadata for the user's bubble.
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

type CodexSendInput = {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  content: string
  attachments?: string[]
  optimisticId?: string
  model?: string
  effort?: string
  fastMode?: boolean
  stream?: boolean
  // Rendered through native additionalContext or the legacy text envelope.
  context?: MoiContext
}

export function sendCodexMessage(input: CodexSendInput): Promise<void> {
  const lane = sendLane(input.workspaceId, input.sessionId)
  const generation = lane.generation
  const sent = lane.tail.then(async () => {
    if (lane.generation !== generation) return
    await sendMessage(input, lane, generation)
  })
  // Serialise acceptance, not entire model turns. A second send can steer as
  // soon as the first start is acknowledged, and failures never poison a lane.
  lane.tail = sent.catch(() => {})
  return sent
}

async function sendMessage(
  input: CodexSendInput,
  lane: SendLane,
  generation: number
): Promise<void> {
  const uploads = input.attachments?.length
    ? resolveUploads(input.workspaceId, input.attachments)
    : []
  if (!input.content && uploads.length === 0) return
  const sessionTitleSource = input.isNew
    ? buildSessionTitleSource(
        input.content,
        uploads.map(upload => upload.filename)
      )
    : undefined
  const { input: userInput, parts } = await buildUserInput(input.content, uploads)
  if (userInput.length === 0) return
  const serviceTier = codexServiceTierForFastMode(input.fastMode)

  let rec: SessionRecord
  try {
    const existing = sessions.get(liveKey(input.workspaceId, input.sessionId))
    if (existing && !existing.bufferedNotifications) rec = existing
    else if (input.isNew && !aliases.has(recKey(input.workspaceId, input.sessionId))) {
      const client = await getCodexClient(input.workspacePath)
      const started = await client.rpc<{ thread: CodexThread; model?: string }>('thread/start', {
        cwd: input.workspacePath,
        config: CODEX_INTERACTION_CONFIG,
        ...CODEX_THREAD_ACCESS,
        ...(input.model ? { model: input.model } : {}),
        ...(serviceTier !== undefined ? { serviceTier } : {})
      })
      const realId = started.thread.id
      if (realId !== input.sessionId) {
        aliases.set(recKey(input.workspaceId, input.sessionId), realId)
        sendLanes.set(recKey(input.workspaceId, realId), lane)
        await renameSessionConfig(input.workspacePath, input.sessionId, realId)
        await renameSelectedSession(input.workspacePath, input.sessionId, realId)
        // Builder tabs follow the same temporary-to-real session rename.
        await renameViewBuilderSession(
          input.workspaceId,
          input.workspacePath,
          input.sessionId,
          realId
        )
        broadcast(input.workspaceId, {
          type: 'session_renamed',
          from: input.sessionId,
          to: realId
        })
      }
      rec = createRecord({
        workspaceId: input.workspaceId,
        workspacePath: input.workspacePath,
        sessionId: realId,
        client,
        refreshSessionsOnTurnComplete: true,
        sessionTitleSource
      })
      rec.model = started.model ?? input.model
      if (
        (input.model || input.effort || input.fastMode !== undefined) &&
        !(await hasSessionConfig(input.workspacePath, realId))
      ) {
        await saveSessionConfig(input.workspacePath, realId, {
          model: input.model,
          effort: input.effort,
          fastMode: input.fastMode
        })
      }
    } else {
      rec = await resumeSession({
        ...input,
        sessionId: aliases.get(recKey(input.workspaceId, input.sessionId)) ?? input.sessionId
      })
    }
  } catch (err) {
    // No session record exists to run setProcessing through — clear the
    // client's optimistic spinner explicitly or it sticks until reconnect.
    broadcast(input.workspaceId, { type: 'status', sessionId: input.sessionId, activity: 'idle' })
    broadcast(input.workspaceId, {
      kind: 'error',
      sessionId: input.sessionId,
      content: err instanceof Error ? err.message : 'failed to start codex session'
    })
    refreshAvailability(input.workspaceId, input.workspacePath)
    return
  }

  if (lane.generation !== generation) return
  rec.lastTouched = Date.now()
  rec.stream = input.stream === true
  if (!rec.stream) clearPreviews(rec)

  if (userInput.some(item => item.type === 'image')) {
    try {
      // Steering keeps the running turn's model, regardless of picker changes.
      const models = await getCodexModelCatalog(input.workspacePath)
      const modelId = rec.activeTurnId ? rec.model : (input.model ?? rec.model)
      const model = models.find(model => model.model === modelId || model.id === modelId)
      if (model?.inputModalities && !model.inputModalities.includes('image')) {
        throw new Error(
          `${model.displayName} does not accept images. Choose a model that supports images.`
        )
      }
    } catch (error) {
      broadcast(rec.workspaceId, {
        kind: 'error',
        sessionId: rec.sessionId,
        content: error instanceof Error ? error.message : 'Could not check image support',
        terminal: !rec.activeTurnId
      })
      if (!rec.activeTurnId) setProcessing(rec, false, null)
      return
    }
    if (lane.generation !== generation) return
  }

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
    const client = rec.client
    // Native context keys become tags, so pass unwrapped bodies. The fallback
    // envelope is stripped from user echoes by adapter.ts.
    const additionalContext = client.supportsAdditionalContext
      ? {
          ...CODEX_LOCAL_CONTROL_CONTEXT,
          ...(input.context
            ? { 'moi-context': { value: renderMoiContextBody(input.context), kind: 'application' } }
            : {})
        }
      : undefined
    if (!additionalContext) {
      const envelope = [
        CODEX_LOCAL_CONTROL_FALLBACK,
        ...(input.context ? [renderMoiContext(input.context)] : [])
      ].join('\n\n')
      const last = userInput[userInput.length - 1]
      if (last?.type === 'text') last.text = appendMoiContext(last.text, envelope)
      else userInput.push({ type: 'text', text: envelope })
    }
    const turnParams = {
      threadId: rec.sessionId,
      clientUserMessageId: turnId,
      input: userInput,
      ...CODEX_TURN_ACCESS,
      ...(additionalContext ? { additionalContext } : {}),
      // Request visible reasoning summaries instead of relying on CLI defaults.
      summary: 'detailed',
      ...(input.model ? { model: input.model } : {}),
      ...(input.effort ? { effort: input.effort } : {}),
      ...(serviceTier !== undefined ? { serviceTier } : {})
    }
    if (rec.activeTurnId) {
      try {
        await client.rpc('turn/steer', {
          threadId: rec.sessionId,
          clientUserMessageId: turnId,
          input: userInput,
          ...(additionalContext ? { additionalContext } : {}),
          expectedTurnId: rec.activeTurnId
        })
      } catch (error) {
        // Only a definitive no-active-turn rejection makes a fresh start safe.
        // Timeouts, auth failures and turn-id mismatches may have accepted the
        // input already, or refer to another active turn.
        if (
          !(error instanceof CodexRpcError) ||
          !/no active turn|not running|no turn in progress/i.test(error.message)
        )
          throw error
        if (lane.generation !== generation) return
        setProcessing(rec, true, null)
        rec.model = input.model ?? rec.model
        const res = await client.rpc<{ turn: CodexTurn }>('turn/start', turnParams)
        acceptStartedTurn(rec, res.turn)
      }
    } else {
      rec.model = input.model ?? rec.model
      const res = await client.rpc<{ turn: CodexTurn }>('turn/start', turnParams)
      acceptStartedTurn(rec, res.turn)
    }
    if (lane.generation !== generation && rec.activeTurnId) {
      await interruptCodexTurn(client, rec.sessionId, rec.activeTurnId)
    }
    if (input.isNew && lane.generation === generation) startCodexSessionTitleJob(rec, client)
    debug(`codex send ws=${rec.workspaceId} thread=${rec.sessionId} turn=${rec.activeTurnId}`)
  } catch (err) {
    // A failed steer does not terminate the turn it was trying to modify.
    // Likewise, a timed-out start can still produce authoritative lifecycle
    // notifications later. Keep a known active turn stoppable.
    if (!rec.activeTurnId) setProcessing(rec, false, null)
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'send failed',
      terminal: !rec.activeTurnId
    })
    refreshAvailability(rec.workspaceId, rec.workspacePath)
  }
}

function acceptStartedTurn(rec: SessionRecord, turn: CodexTurn) {
  if (rec.completedTurns.has(turn.id)) return
  if (turn.status === 'inProgress') setProcessing(rec, true, turn.id)
  else handleNotification(rec, 'turn/completed', { threadId: rec.sessionId, turn })
}

export async function interruptCodexRun(input: {
  workspaceId: string
  sessionId: string
}): Promise<void> {
  const lane = sendLane(input.workspaceId, input.sessionId)
  lane.generation++ // cancels queued sends, including a start still initializing
  const rec = sessions.get(liveKey(input.workspaceId, input.sessionId))
  rec?.inputs.cancel()
  if (!rec?.activeTurnId) {
    broadcast(input.workspaceId, { kind: 'stopped', sessionId: rec?.sessionId ?? input.sessionId })
    if (rec) setProcessing(rec, false, null)
    else
      broadcast(input.workspaceId, { type: 'status', sessionId: input.sessionId, activity: 'idle' })
    return
  }
  try {
    await interruptCodexTurn(rec.client, rec.sessionId, rec.activeTurnId)
    // turn/completed is authoritative. In particular, don't emit a second
    // stopped frame or claim idle while the command is still shutting down.
  } catch (err) {
    broadcast(rec.workspaceId, {
      kind: 'error',
      sessionId: rec.sessionId,
      content: err instanceof Error ? err.message : 'Interrupt failed',
      terminal: !rec.activeTurnId
    })
    throw err
  }
}

export function answerCodexInput(
  workspaceId: string,
  sessionId: string,
  requestId: string,
  answers: unknown
): void {
  const rec = sessions.get(liveKey(workspaceId, sessionId))
  if (!rec) throw new Error('This chat is no longer waiting for input')
  rec.inputs.answer(requestId, answers)
}

export function viewAsEvents(rec: SessionRecord): StreamEvent[] {
  const evs: StreamEvent[] = []
  for (const turn of rec.view.turns) evs.push({ kind: 'turn', turn })
  for (const notice of rec.view.notices) evs.push({ kind: 'notice', notice })
  return evs
}

// Serve the live display copy so REST and WebSocket events stay consistent.
export function getLiveCodexEvents(workspaceId: string, sessionId: string): StreamEvent[] | null {
  const rec = sessions.get(liveKey(workspaceId, sessionId))
  if (rec) rec.lastTouched = Date.now()
  return rec && !rec.bufferedNotifications ? viewAsEvents(rec) : null
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
