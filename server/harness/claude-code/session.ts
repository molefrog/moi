// One long-lived SDK query per session, with follow-ups queued in moi.
//
// Dispatch waits for the preceding user turn to finish before applying the next
// message's settings. Pending messages survive subprocess replacement; running
// background tasks retain their process until they finish.
//
// The SDK persists history to disk. After eviction or a server restart, the
// next message resumes that history in a new process.
import {
  type Options,
  type Query,
  type SDKUserMessage,
  query
} from '@anthropic-ai/claude-agent-sdk'

import { appendAttachmentNote, attachmentOnlyPlaceholder } from '@/lib/attachment-note'
import { buildSessionTitleSource } from '../session-title'
import { ClaudeAdapter } from './adapter'
import { CLAUDE_APPROVAL_HOOKS } from './permissions'
import { claudeSessionExists } from './sessions'
import { generateClaudeSessionTitle, renameClaudeSessionIfUnchanged } from './session-title'
import type { Part } from '@/lib/format'
import type { SessionActivity } from '@/lib/types'
import { moiContextSystemReminder, renderMoiContext } from '@/lib/moi-context'

import { debug } from '../../debug'
import { tapWire } from '../debug'
import { broadcast } from '../../state'
import { renameSelectedSession } from '../../selected-session'
import { hasSessionConfig, renameSessionConfig, saveSessionConfig } from '../../session-config'
import { type StoredUpload, resolveUploads, uploadToDisplayPart } from '../../uploads'
import {
  markViewBuilderBuildingBySession,
  markViewBuilderWaitingBySession,
  renameViewBuilderSession
} from '../../view-builders'
import { resolveWorkspaceEnv } from '../../workspace-env'
import { requireHarnessExecutable } from '../executable'
import type { SendMessageInput } from '../types'

// Media types Claude vision accepts; uploads.ts guarantees every image upload is
// normalized to one of these, so the cast on `media_type` below is sound.
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

type MessageContent = SDKUserMessage['message']['content']

// Send images inline and other files by path. Keep those paths out of the
// user's display text.
export function buildUserMessage(
  text: string,
  uploads: StoredUpload[],
  displayText = text
): { content: MessageContent; parts: Part[] } {
  const parts: Part[] = []
  for (const u of uploads) {
    const part = uploadToDisplayPart(u)
    if (part) parts.push(part)
  }
  if (displayText) parts.push({ type: 'text', text: displayText })

  if (uploads.length === 0) return { content: text, parts }

  const blocks: Exclude<MessageContent, string> = []
  for (const u of uploads) {
    if (u.kind === 'image' && u.data) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: u.mediaType as ImageMediaType,
          data: u.data.toString('base64')
        }
      })
    }
  }

  const files = uploads.filter(u => u.kind === 'file' && u.path)
  const agentText = appendAttachmentNote(
    text || attachmentOnlyPlaceholder(uploads.map(upload => upload.filename)),
    files.map(f => ({ filename: f.filename, path: f.path! }))
  )
  // Always end with a text block so an image-only message still has a prompt.
  blocks.push({ type: 'text', text: agentText })
  return { content: blocks, parts }
}

// Each live session owns a subprocess. Only idle sessions can be evicted.
const MAX_LIVE_SESSIONS = 8
const IDLE_TTL_MS = 5 * 60_000

// Older CLIs lack background-task snapshots. These task types outlive the turn;
// other types count only when their event explicitly marks them backgrounded.
const LEGACY_BG_TASK_TYPES = new Set(['local_bash', 'local_workflow'])

type InputQueue = {
  iterator: AsyncGenerator<SDKUserMessage>
  push: (content: MessageContent, uuid: NonNullable<SDKUserMessage['uuid']>) => void
  clear: () => void
  close: () => void
}

type PendingMessage = {
  input: SendMessageInput
  content: MessageContent
  titleSource: string
  turnId: string
  wireId: NonNullable<SDKUserMessage['uuid']>
  label: string
  resolve: () => void
  reject: (error: Error) => void
  completed: Promise<void>
  complete: () => void
}

// This queue outlives its subprocess. Register it before any async setup so
// concurrent first sends share one session, including across temp-id renames.
type SessionMessages = {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  pending: PendingMessage[]
  active: PendingMessage | null
  dispatching: boolean
  stopping: boolean
  publishedActivity: SessionActivity
  live?: LiveSession
}

type LiveSession = {
  messages: SessionMessages
  workspaceId: string
  workspacePath: string
  workspaceEnv: Record<string, string>
  sessionId: string // current real id (rekeyed on rename)
  q: Query
  adapter: ClaudeAdapter
  input: InputQueue
  abort: AbortController
  // SDK activity, set optimistically to running when a prompt is dispatched.
  activity: SessionActivity
  // Without state events, the matching result is the turn-completion signal.
  sawStateEvents: boolean
  turnEnded: boolean
  // The SDK's full set of background tasks, including subagents and ambient
  // watchers. All retain their process; none alone makes the chat busy.
  bgTasks: Set<string>
  // Once this process emits a snapshot, task edges must never mutate its set:
  // the SDK does not guarantee their ordering relative to snapshots.
  sawBackgroundSnapshot: boolean
  model: string | undefined
  // Live flag settings; undefined inherits provider defaults.
  fastMode: boolean | undefined
  effort: string | undefined
  // `includePartialMessages` is fixed at creation, so changes require resume.
  stream: boolean
  // Rebuild before the next send, once this turn and background tasks finish.
  staleCli: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
  // Passed to the view builder when the session becomes idle.
  lastBuilderError: string | undefined
  // Introspection only (surfaced by /status) — not load-bearing.
  createdAt: number
  lastActivityAt: number
  lastUserText: string | undefined
  refreshSessionsOnResult: boolean
  sessionTitleSource: string | undefined
  sessionTitleAbort: AbortController | null
}

const sessions = new Map<string, LiveSession>()
const messageQueues = new Map<string, SessionMessages>()
// `${workspaceId}:${tempId}` -> real session id. Follow-ups may still use the
// client's temporary id after the SDK has assigned the real one.
const aliases = new Map<string, string>()

function recKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

// Resolve the live-session key for a (workspaceId, sessionId), following a
// temp->real alias when the direct key isn't live.
function liveKey(workspaceId: string, sessionId: string): string {
  const direct = recKey(workspaceId, sessionId)
  if (sessions.has(direct)) return direct
  const real = aliases.get(direct)
  return real ? recKey(workspaceId, real) : direct
}

// Non-idle sessions across all workspaces, for the status snapshot.
export function getCCActiveSessions(): {
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}[] {
  const out: { workspaceId: string; sessionId: string; activity: SessionActivity }[] = []
  for (const messages of messageQueues.values()) {
    const activity = messageActivity(messages)
    if (activity !== 'idle') {
      out.push({ workspaceId: messages.workspaceId, sessionId: messages.sessionId, activity })
    }
  }
  return out
}

// Caps surfaced in /status so the numbers there are self-explanatory.
export const SESSION_LIMITS = { maxLive: MAX_LIVE_SESSIONS, idleTtlMs: IDLE_TTL_MS }

export type CCDebugSession = {
  workspaceId: string
  sessionId: string
  model: string | undefined
  fastMode: boolean | undefined
  effort: string | undefined
  stream: boolean
  queuedMessages: number
  staleCli: boolean
  activity: SessionActivity
  bgTasks: number
  closed: boolean
  hasIdleTimer: boolean
  createdAt: number
  lastActivityAt: number
  lastUserText: string | undefined
}

// Session diagnostics for /status.
export function getCCDebugSnapshot(): { sessions: CCDebugSession[]; aliases: number } {
  return {
    sessions: [...sessions.values()].map(s => ({
      workspaceId: s.workspaceId,
      sessionId: s.sessionId,
      model: s.model,
      fastMode: s.fastMode,
      effort: s.effort,
      stream: s.stream,
      queuedMessages: s.messages.pending.length,
      staleCli: s.staleCli,
      activity: s.activity,
      bgTasks: s.bgTasks.size,
      closed: s.closed,
      hasIdleTimer: s.idleTimer !== null,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt,
      lastUserText: s.lastUserText
    })),
    aliases: aliases.size
  }
}

// Waiting when empty keeps the SDK session open between prompts.
function createInputQueue(): InputQueue {
  const buffer: SDKUserMessage[] = []
  let wake: (() => void) | null = null
  let closed = false

  async function* gen(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (buffer.length === 0) {
        if (closed) return
        await new Promise<void>(resolve => {
          wake = resolve
        })
        if (closed && buffer.length === 0) return
      }
      while (buffer.length) yield buffer.shift()!
    }
  }

  return {
    iterator: gen(),
    push(content: MessageContent, uuid: NonNullable<SDKUserMessage['uuid']>) {
      buffer.push({
        type: 'user',
        uuid,
        message: { role: 'user', content },
        parent_tool_use_id: null
      })
      wake?.()
      wake = null
    },
    clear() {
      buffer.length = 0
    },
    close() {
      closed = true
      wake?.()
      wake = null
    }
  }
}

function setActivity(s: LiveSession, activity: SessionActivity) {
  s.activity = activity
  publishMessageActivity(s.messages)
}

function messageActivity(messages: SessionMessages): SessionActivity {
  const activity = messages.live?.activity ?? 'idle'
  if (activity !== 'idle') return activity
  return messages.active || messages.pending.length || messages.dispatching ? 'running' : 'idle'
}

function publishMessageActivity(messages: SessionMessages) {
  const activity = messageActivity(messages)
  if (messages.publishedActivity === activity) return
  messages.publishedActivity = activity
  broadcast(messages.workspaceId, { type: 'status', sessionId: messages.sessionId, activity })
}

function clearIdle(s: LiveSession) {
  if (s.idleTimer) {
    clearTimeout(s.idleTimer)
    s.idleTimer = null
  }
}

function armIdle(s: LiveSession) {
  clearIdle(s)
  s.idleTimer = setTimeout(() => {
    if (s.activity !== 'idle' || s.messages.active || s.messages.dispatching) return
    if (s.bgTasks.size > 0) {
      // Eviction would kill the background tasks too.
      debug(
        `cc idle-keepalive ws=${s.workspaceId} session=${s.sessionId} bgTasks=${s.bgTasks.size}`
      )
      armIdle(s)
      return
    }
    teardown(s)
  }, IDLE_TTL_MS)
}

function teardown(s: LiveSession) {
  if (s.closed) return
  debug(`cc teardown ws=${s.workspaceId} session=${s.sessionId} activity=${s.activity}`)
  // Terminal status first, while the session is still registered — the consume
  // finally can't be relied on (a hung SDK iterator never reaches it).
  setActivity(s, 'idle')
  s.closed = true
  clearIdle(s)
  s.sessionTitleAbort?.abort()
  s.sessionTitleAbort = null
  s.input.close()
  try {
    s.q.close?.()
  } catch {}
  try {
    s.abort.abort()
  } catch {}
  if (sessions.get(recKey(s.workspaceId, s.sessionId)) === s) {
    sessions.delete(recKey(s.workspaceId, s.sessionId))
  }
  if (s.messages.live === s) s.messages.live = undefined
  publishMessageActivity(s.messages)
  forgetEmptyQueue(s.messages)
}

function forgetEmptyQueue(messages: SessionMessages) {
  if (messages.live || messages.dispatching || messages.active || messages.pending.length) return
  const key = recKey(messages.workspaceId, messages.sessionId)
  if (messageQueues.get(key) === messages) messageQueues.delete(key)
}

function isCurrentLiveSession(s: LiveSession, abort: AbortController): boolean {
  return (
    !s.closed && !abort.signal.aborted && sessions.get(recKey(s.workspaceId, s.sessionId)) === s
  )
}

function startClaudeSessionTitleJob(s: LiveSession) {
  if (!s.sessionTitleSource || s.closed) return
  const source = s.sessionTitleSource
  s.sessionTitleSource = undefined
  const abort = new AbortController()
  s.sessionTitleAbort = abort

  void (async () => {
    try {
      const title = await generateClaudeSessionTitle({
        source,
        abortController: abort
      })
      if (!title || !isCurrentLiveSession(s, abort)) return

      const renamed = await renameClaudeSessionIfUnchanged({
        sessionId: s.sessionId,
        workspacePath: s.workspacePath,
        title,
        isCurrent: () => isCurrentLiveSession(s, abort)
      })
      if (!renamed || !isCurrentLiveSession(s, abort)) return
      broadcast(s.workspaceId, { type: 'sessions_changed', sessionId: s.sessionId })
      debug(
        `cc session title ws=${s.workspaceId} session=${s.sessionId} title=${JSON.stringify(title)}`
      )
    } catch (err) {
      debug(
        `cc session title failed ws=${s.workspaceId} session=${s.sessionId}: ${err instanceof Error ? err.message : String(err)}`
      )
    } finally {
      if (s.sessionTitleAbort === abort) s.sessionTitleAbort = null
    }
  })()
}

// Move both registries to the SDK's real id, preserving the temporary alias.
function renameSession(s: LiveSession, realId: string): string {
  const from = s.sessionId
  sessions.delete(recKey(s.workspaceId, from))
  s.sessionId = realId
  sessions.set(recKey(s.workspaceId, realId), s)
  aliases.set(recKey(s.workspaceId, from), realId)
  messageQueues.delete(recKey(s.workspaceId, from))
  s.messages.sessionId = realId
  s.messages.isNew = false
  messageQueues.set(recKey(s.workspaceId, realId), s.messages)
  return from
}

// Keep the active message reserved across async bookkeeping. Sends arriving
// here join moi's queue; they cannot race a teardown or change the live model.
async function onSessionIdle(s: LiveSession) {
  const active = s.messages.active
  if (s.messages.dispatching || (active && !s.turnEnded)) return
  await markViewBuilderWaitingBySession(
    s.workspaceId,
    s.workspacePath,
    s.sessionId,
    s.lastBuilderError
  )
  if (s.closed || s.messages.dispatching || s.messages.active !== active) return
  active?.complete()
  s.messages.active = null
  setActivity(s, 'idle')
  armIdle(s)
  void dispatchNextMessage(s.messages)
}

async function consume(s: LiveSession) {
  try {
    for await (const msg of s.q) {
      if (s.closed) break
      tapWire(s.workspaceId, 'recv', msg)
      if (msg.type === 'system' && msg.subtype === 'init') {
        s.messages.isNew = false
        const realId = msg.session_id
        if (realId && realId !== s.sessionId) {
          const from = renameSession(s, realId)
          // Carry any config the picker wrote under the temp id to the real id.
          await renameSessionConfig(s.workspacePath, from, s.sessionId)
          await renameSelectedSession(s.workspacePath, from, s.sessionId)
          await renameViewBuilderSession(s.workspaceId, s.workspacePath, from, s.sessionId)
          broadcast(s.workspaceId, {
            type: 'session_renamed',
            from,
            to: s.sessionId
          })
        }
        startClaudeSessionTitleJob(s)
        // Seed explicit startup settings only when no saved picker choice exists.
        if (
          (s.model || s.effort || s.fastMode !== undefined) &&
          !(await hasSessionConfig(s.workspacePath, s.sessionId))
        ) {
          await saveSessionConfig(s.workspacePath, s.sessionId, {
            model: s.model,
            effort: s.effort,
            fastMode: s.fastMode
          })
        }
      }
      for (const ev of s.adapter.ingest(msg)) {
        if (ev.kind === 'preview') {
          // Token previews are transient and stay outside transcript history.
          broadcast(s.workspaceId, {
            type: 'preview',
            sessionId: s.sessionId,
            messageId: ev.preview.messageId,
            parentToolUseId: ev.preview.parentToolUseId,
            blocks: ev.preview.blocks
          })
        } else {
          broadcast(s.workspaceId, { ...ev, sessionId: s.sessionId })
        }
      }
      if (msg.type === 'system' && msg.subtype === 'init') {
        debug(`cc init ws=${s.workspaceId} session=${s.sessionId}`)
      }
      // Background notifications can start an SDK turn without a user send.
      if ((msg.type === 'assistant' || msg.type === 'stream_event') && s.activity === 'idle') {
        setActivity(s, 'running')
      }
      // Prefer explicit idle events when available; otherwise use the result
      // fallback below. Some CLIs omit these events in streaming-input mode.
      if (msg.type === 'system' && msg.subtype === 'session_state_changed') {
        s.sawStateEvents = true
        s.lastActivityAt = Date.now()
        debug(`cc state ws=${s.workspaceId} session=${s.sessionId} state=${msg.state}`)
        if (msg.state === 'running') setActivity(s, 'running')
        else if (msg.state === 'requires_action') setActivity(s, 'requires-action')
        else if (msg.state === 'idle') {
          await onSessionIdle(s)
        }
      }
      // Snapshots replace the entire set, healing missed starts/completions.
      // Keep the edge-based fallback only until this process sends a snapshot.
      if (msg.type === 'system') {
        let tasksChanged = false
        if (msg.subtype === 'background_tasks_changed') {
          s.sawBackgroundSnapshot = true
          s.bgTasks = new Set(msg.tasks.map(task => task.task_id))
          tasksChanged = true
        } else if (!s.sawBackgroundSnapshot) {
          if (
            msg.subtype === 'task_started' &&
            (msg.is_backgrounded || LEGACY_BG_TASK_TYPES.has(msg.task_type ?? ''))
          ) {
            s.bgTasks.add(msg.task_id)
          } else if (msg.subtype === 'task_notification') {
            tasksChanged = s.bgTasks.delete(msg.task_id)
          } else if (msg.subtype === 'task_updated') {
            const status = msg.patch.status
            if (
              status === 'completed' ||
              status === 'failed' ||
              status === 'killed' ||
              msg.patch.is_backgrounded === false
            ) {
              tasksChanged = s.bgTasks.delete(msg.task_id)
            } else if (msg.patch.is_backgrounded) {
              s.bgTasks.add(msg.task_id)
            }
          }
        }
        if (tasksChanged) {
          debug(`cc bg-tasks ws=${s.workspaceId} session=${s.sessionId} live=${s.bgTasks.size}`)
          void dispatchNextMessage(s.messages)
        }
      }
      if (msg.type === 'result') {
        // Newer CLIs identify the user messages consumed by a result. An
        // autonomous background turn can finish while our prompt is still
        // waiting inside the CLI; its result must not release that prompt.
        const active = s.messages.active
        const consumed =
          msg.user_message_uuids ?? (msg.user_message_uuid ? [msg.user_message_uuid] : undefined)
        const turnFinished =
          !active || (!msg.queued_turn_count && (!consumed || consumed.includes(active.wireId)))
        if (turnFinished) s.turnEnded = true
        s.lastActivityAt = Date.now()
        // Remembered for the idle transition — the view builder shows the last
        // turn's error once the queue drains.
        s.lastBuilderError =
          msg.subtype === 'success'
            ? undefined
            : msg.errors.join('\n') || msg.subtype.replaceAll('_', ' ')
        debug(`cc result ws=${s.workspaceId} session=${s.sessionId} subtype=${msg.subtype}`)
        if (s.refreshSessionsOnResult) {
          s.refreshSessionsOnResult = false
          broadcast(s.workspaceId, { type: 'sessions_changed', sessionId: s.sessionId })
        }
        // Without state events, only a result that finishes the active prompt
        // (or an autonomous turn when none is active) can release the queue.
        if (!s.sawStateEvents && turnFinished) {
          await onSessionIdle(s)
        }
      }
    }
  } catch (err) {
    debug(
      `cc consume error ws=${s.workspaceId} session=${s.sessionId}: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`
    )
    if (!(err instanceof Error && err.name === 'AbortError')) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      broadcast(s.workspaceId, {
        kind: 'error',
        sessionId: s.sessionId,
        content: message
      })
      await markViewBuilderWaitingBySession(s.workspaceId, s.workspacePath, s.sessionId, message)
    }
  } finally {
    // An expected restart only replaces the subprocess. An unexpected exit
    // cancels pending sends visibly rather than leaving their promises hanging.
    if (!s.closed) {
      const error = new Error('Agent session closed before queued messages were sent')
      if (s.messages.pending.length)
        broadcast(s.workspaceId, { kind: 'error', sessionId: s.sessionId, content: error.message })
      cancelPendingMessages(s.messages, error)
      s.messages.active?.complete()
      s.messages.active = null
    }
    teardown(s)
  }
}

function cancelPendingMessages(messages: SessionMessages, error: Error) {
  for (const message of messages.pending.splice(0)) {
    message.reject(error)
    message.complete()
  }
}

// Close one idle session to stay under the cap. A running session — or one
// with live background tasks — is never evicted; if everything is busy we allow
// a temporary overflow rather than killing a run.
function evictIfNeeded() {
  if (sessions.size < MAX_LIVE_SESSIONS) return
  for (const s of sessions.values()) {
    if (
      s.activity === 'idle' &&
      s.bgTasks.size === 0 &&
      !s.messages.dispatching &&
      !s.messages.active &&
      s.messages.pending.length === 0
    ) {
      teardown(s)
      return
    }
  }
}

function createLiveSession(input: {
  messages: SessionMessages
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  model: string | undefined
  effort: string | undefined
  fastMode: boolean | undefined
  stream: boolean
  // Resolved workspace env, fixed for the lifetime of the subprocess.
  workspaceEnv: Record<string, string>
  sessionTitleSource: string | undefined
}): LiveSession {
  evictIfNeeded()

  const queue = createInputQueue()
  const abort = new AbortController()
  const options: Options = {
    abortController: abort,
    pathToClaudeCodeExecutable: requireHarnessExecutable('claude-code'),
    // One query spans many user messages.
    maxTurns: 1000,
    cwd: input.workspacePath,
    // Request summaries explicitly; some models otherwise omit thinking text.
    thinking: { type: 'adaptive', display: 'summarized' },
    ...(input.model ? { model: input.model } : {}),
    // Harness-neutral settings are strings; the picker supplies this model's
    // supported effort levels from the SDK catalog.
    ...(input.effort ? { effort: input.effort as Options['effort'] } : {}),
    ...(input.fastMode !== undefined ? { settings: { fastMode: input.fastMode } } : {}),
    // Partial frames enable the opt-in live preview.
    includePartialMessages: input.stream,
    permissionMode: 'auto',
    // Every tool call is approved before the permission system runs — see
    // `permissions.ts`. `canUseTool` stays as the fallback for anything that
    // reaches a prompt without passing through `PreToolUse`.
    hooks: CLAUDE_APPROVAL_HOOKS,
    canUseTool: async (_toolName, toolInput) => ({ behavior: 'allow', updatedInput: toolInput }),
    settingSources: ['user', 'project'],
    // MOI_AGENT marks every shell this session spawns as agent-driven (the
    // moi CLI reads it — see agent-caller.ts), surviving the CLAUDECODE strip.
    env: { ...process.env, ...input.workspaceEnv, CLAUDECODE: undefined, MOI_AGENT: '1' },
    stderr: (data: string) => console.error('[SDK stderr]', data)
  }
  if (!input.isNew) options.resume = input.sessionId

  const session: LiveSession = {
    messages: input.messages,
    workspaceId: input.workspaceId,
    workspacePath: input.workspacePath,
    workspaceEnv: input.workspaceEnv,
    sessionId: input.sessionId,
    q: query({ prompt: queue.iterator, options }),
    adapter: new ClaudeAdapter(),
    input: queue,
    abort,
    activity: 'idle',
    sawStateEvents: false,
    turnEnded: false,
    bgTasks: new Set(),
    sawBackgroundSnapshot: false,
    model: input.model,
    fastMode: input.fastMode,
    effort: input.effort,
    stream: input.stream,
    staleCli: false,
    idleTimer: null,
    closed: false,
    lastBuilderError: undefined,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    lastUserText: undefined,
    refreshSessionsOnResult: input.isNew,
    sessionTitleSource: input.sessionTitleSource,
    sessionTitleAbort: null
  }
  sessions.set(recKey(session.workspaceId, session.sessionId), session)
  input.messages.live = session
  debug(
    `cc create ${input.isNew ? 'new' : 'resume'} ws=${input.workspaceId} session=${input.sessionId} model=${input.model ?? 'default'} effort=${input.effort ?? 'default'} fast=${input.fastMode ?? 'default'} live=${sessions.size}`
  )
  void consume(session)
  return session
}

// Accept immediately, but keep the prompt and its settings in moi until its
// turn starts. The returned promise settles when the message reaches the SDK.
export async function sendCCMessage(input: SendMessageInput): Promise<void> {
  // Expired uploads are omitted. Avoid starting a session if nothing remains.
  const uploads = input.attachments?.length
    ? resolveUploads(input.workspaceId, input.attachments)
    : []
  if (!input.content && uploads.length === 0) return
  const { content: userContent, parts } = buildUserMessage(input.content, uploads)
  // Keep context in its own block: the SDK skips tag-leading blocks when
  // extracting titles and previews, and the adapter strips them on replay.
  const content: MessageContent = input.context
    ? [
        { type: 'text', text: moiContextSystemReminder(renderMoiContext(input.context)) },
        ...(typeof userContent === 'string'
          ? [{ type: 'text' as const, text: userContent }]
          : userContent)
      ]
    : userContent

  const key = liveKey(input.workspaceId, input.sessionId)
  let messages = messageQueues.get(key)
  if (!messages) {
    messages = {
      workspaceId: input.workspaceId,
      workspacePath: input.workspacePath,
      sessionId: aliases.get(recKey(input.workspaceId, input.sessionId)) ?? input.sessionId,
      isNew: input.isNew && !aliases.has(recKey(input.workspaceId, input.sessionId)),
      pending: [],
      active: null,
      dispatching: false,
      stopping: false,
      publishedActivity: 'idle'
    }
    messageQueues.set(key, messages)
  }
  const turnId = input.optimisticId ?? crypto.randomUUID()
  broadcast(messages.workspaceId, {
    kind: 'turn',
    sessionId: messages.sessionId,
    turn: {
      id: turnId,
      role: 'user',
      origin: { kind: 'user-input' },
      parts,
      timestamp: new Date().toISOString()
    }
  })
  const label = input.content || uploads.map(u => u.filename).join(', ')
  const completion = Promise.withResolvers<void>()
  const accepted = new Promise<void>((resolve, reject) => {
    messages.pending.push({
      input,
      content,
      titleSource: buildSessionTitleSource(
        input.content,
        uploads.map(u => u.filename)
      ),
      turnId,
      wireId: crypto.randomUUID(),
      label: label.replace(/\s+/g, ' ').slice(0, 120),
      resolve,
      reject,
      completed: completion.promise,
      complete: completion.resolve
    })
  })
  publishMessageActivity(messages)
  void dispatchNextMessage(messages)
  return accepted
}

// Serialize session creation, per-message settings, and prompt writes.
// Recheck cancellation and replacement after awaits before sending the prompt.
async function dispatchNextMessage(messages: SessionMessages): Promise<void> {
  if (messages.dispatching || messages.stopping || messages.active) return
  const message = messages.pending[0]
  if (!message) {
    forgetEmptyQueue(messages)
    return
  }
  let s = messages.live
  if (s && s.activity !== 'idle') return
  const { input } = message
  const stream = input.stream === true
  const rebuild = s && (s.staleCli || stream !== s.stream)
  // Background jobs belong to their subprocess. Retain both the job and the
  // queued prompt until it is safe to resume with the requested configuration.
  if (s && rebuild && s.bgTasks.size > 0) return

  messages.dispatching = true
  const cancelled = () => messages.stopping || messages.pending[0] !== message
  try {
    if (s && rebuild) {
      teardown(s)
      s = undefined
    }
    if (!s) {
      const workspaceEnv = await resolveWorkspaceEnv(messages.workspacePath)
      if (cancelled()) return
      const isNew =
        messages.isNew ||
        !(await claudeSessionExists(messages.sessionId, messages.workspacePath, workspaceEnv))
      if (cancelled()) return
      s = createLiveSession({
        messages,
        workspaceId: messages.workspaceId,
        workspacePath: messages.workspacePath,
        sessionId: messages.sessionId,
        isNew,
        model: input.model,
        effort: input.effort,
        fastMode: input.fastMode,
        stream,
        workspaceEnv,
        sessionTitleSource: isNew ? message.titleSource : undefined
      })
    } else {
      clearIdle(s)
      // A failed setter must reject this send, never silently use the previous
      // model or flags. Later queued messages can still use the healthy query.
      if (input.model !== s.model) {
        await s.q.setModel(input.model)
        // Stop cancels the prompt, not a control request already acknowledged
        // by the CLI. Remember the applied value so the next send can reset it.
        if (!s.closed) s.model = input.model
        if (cancelled()) return
        if (s.closed) throw new Error('Agent session closed before the message was sent')
      }
      if (input.effort !== s.effort || input.fastMode !== s.fastMode) {
        await s.q.applyFlagSettings({
          ...(input.effort !== s.effort
            ? { effortLevel: (input.effort as Options['effort']) ?? null }
            : {}),
          ...(input.fastMode !== s.fastMode ? { fastMode: input.fastMode ?? null } : {})
        })
        if (!s.closed) {
          s.effort = input.effort
          s.fastMode = input.fastMode
        }
        if (cancelled()) return
        if (s.closed) throw new Error('Agent session closed before the message was sent')
      }
    }
    await markViewBuilderBuildingBySession(s.workspaceId, s.workspacePath, s.sessionId)
    if (cancelled()) return
    if (s.closed) throw new Error('Agent session closed before the message was sent')
    // A catalog refresh can arrive during any of the awaits above. Retry
    // before handing off the prompt; the queue still owns it at this point.
    if (s.staleCli) {
      if (s.bgTasks.size === 0) teardown(s)
      return
    }
    messages.pending.shift()
    messages.active = message
    s.turnEnded = false
    s.lastActivityAt = Date.now()
    s.lastUserText = message.label
    s.adapter.expectUserEcho(message.turnId, input.content)
    setActivity(s, 'running')
    clearIdle(s)
    s.input.push(message.content, message.wireId)
    tapWire(s.workspaceId, 'send', { type: 'user', content: message.content })
    message.resolve()
  } catch (error) {
    if (!cancelled() && s?.staleCli) {
      if (!s.closed && s.bgTasks.size === 0) teardown(s)
      return
    }
    if (!cancelled()) {
      messages.pending.shift()
      const err = error instanceof Error ? error : new Error(String(error))
      broadcast(messages.workspaceId, {
        kind: 'error',
        sessionId: messages.sessionId,
        content: err.message
      })
      message.reject(err)
      message.complete()
    }
  } finally {
    messages.dispatching = false
    publishMessageActivity(messages)
    if (s && !s.closed && s.activity === 'idle') armIdle(s)
    void dispatchNextMessage(messages)
  }
}

// Bound both interrupt acknowledgement and turn completion.
const INTERRUPT_TIMEOUT_MS = 5_000

// Cancel queued sends and interrupt the active turn. A failed or timed-out
// interrupt closes the process so the next send can resume in a fresh one.
export async function interruptCCSession(workspaceId: string, sessionId: string): Promise<void> {
  const messages = messageQueues.get(liveKey(workspaceId, sessionId))
  if (!messages) return
  messages.stopping = true
  cancelPendingMessages(messages, new Error('Message cancelled'))
  const s = messages.live
  if (!s) {
    messages.stopping = false
    publishMessageActivity(messages)
    forgetEmptyQueue(messages)
    broadcast(workspaceId, { kind: 'stopped', sessionId: messages.sessionId })
    return
  }
  debug(`cc interrupt ws=${workspaceId} session=${sessionId} activity=${s.activity}`)
  s.input.clear()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = Symbol('interrupt-timeout')
  const active = messages.active
  try {
    const outcome = await Promise.race([
      (async () => {
        await s.q.interrupt()
        // Receipt and result are separate protocol messages. Bound both so a
        // CLI that acknowledges Stop but never finishes cannot wedge the chat.
        await active?.completed
      })(),
      new Promise(resolve => {
        timer = setTimeout(() => resolve(timedOut), INTERRUPT_TIMEOUT_MS)
      })
    ])
    if (outcome === timedOut) {
      debug(`cc interrupt timeout ws=${workspaceId} session=${sessionId} — tearing down`)
      teardown(s)
    }
  } catch (err) {
    console.error('[cc-session] interrupt failed', err)
    teardown(s)
  } finally {
    clearTimeout(timer)
    if (s.closed) {
      active?.complete()
      messages.active = null
    }
    messages.stopping = false
  }
  broadcast(s.workspaceId, { kind: 'stopped', sessionId: s.sessionId })
  if (!messages.active) setActivity(s, 'idle')
  await markViewBuilderWaitingBySession(s.workspaceId, s.workspacePath, s.sessionId)
  if (!s.closed && !messages.active) armIdle(s)
  void dispatchNextMessage(messages)
}

// Evict idle sessions so their next send picks up fresh workspace env. Busy
// sessions retain their environment until a later teardown.
export function restartWorkspaceSessions(workspacePath: string): void {
  for (const s of [...sessions.values()]) {
    if (
      s.workspacePath === workspacePath &&
      s.activity === 'idle' &&
      s.bgTasks.size === 0 &&
      !s.messages.dispatching &&
      !s.messages.active &&
      s.messages.pending.length === 0
    )
      teardown(s)
  }
}

// Stop every queued message and subprocess for a workspace being removed.
export function killWorkspaceSessions(workspacePath: string): void {
  for (const messages of messageQueues.values()) {
    if (messages.workspacePath !== workspacePath) continue
    messages.stopping = true
    cancelPendingMessages(messages, new Error('Workspace removed'))
    messages.active?.complete()
    messages.active = null
  }
  for (const s of [...sessions.values()]) {
    if (s.workspacePath === workspacePath) teardown(s)
  }
  for (const [key, messages] of messageQueues) {
    if (messages.workspacePath === workspacePath) messageQueues.delete(key)
  }
}

// A CLI update may introduce models the current process cannot use. Mark it
// for replacement at the next safe dispatch boundary.
export function retireCCSessionsOnCliChange(): void {
  for (const s of sessions.values()) s.staleCli = true
}

// Server shutdown must settle pending sends and close every subprocess.
export function killAllCCSessions(): void {
  for (const messages of messageQueues.values()) {
    messages.stopping = true
    cancelPendingMessages(messages, new Error('Agent sessions stopped'))
    messages.active?.complete()
    messages.active = null
  }
  for (const s of [...sessions.values()]) teardown(s)
  messageQueues.clear()
}
