// Live Claude Code sessions held open in the server process.
//
// Each (workspaceId, sessionId) gets ONE long-lived `query()` running in
// streaming-input mode: a single agent session that consumes user messages from
// an in-memory queue and streams output to all connected clients. Follow-up
// messages (and messages from multiple browser tabs) are pushed into the same
// queue — so they're *queued* instead of rejected, and there's no cold `resume`
// between turns.
//
// Disk stays the source of truth: the SDK persists each block to the session
// `.jsonl` incrementally, so a (re)connecting client reads /events then folds
// live deltas. If a session is idle-evicted (or lost on a server restart), the
// next message recreates it with `resume` — transparently.
import {
  type Options,
  type Query,
  type SDKUserMessage,
  query
} from '@anthropic-ai/claude-agent-sdk'

import { ATTACHMENT_ONLY_PLACEHOLDER, appendAttachmentNote } from '@/lib/attachment-note'
import { ClaudeAdapter } from './adapter'
import type { Part } from '@/lib/format'
import type { SessionActivity } from '@/lib/types'
import { stripViewBuilderMeta } from '@/lib/view-builder-meta'

import { debug } from '../../debug'
import { tapWire } from '../debug'
import { broadcast } from '../../state'
import { hasThreadConfig, renameThreadConfig, saveThreadConfig } from '../../thread-config'
import { type StoredUpload, resolveUploads, uploadToDisplayPart } from '../../uploads'
import {
  markViewBuilderBuildingBySession,
  markViewBuilderWaitingBySession,
  renameViewBuilderSession
} from '../../view-builders'
import { resolveWorkspaceEnv } from '../../workspace-env'
import { requireHarnessExecutable } from '../executable'

// Media types Claude vision accepts; uploads.ts guarantees every image upload is
// normalized to one of these, so the cast on `media_type` below is sound.
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

// What the SDK's streaming-input prompt accepts for one message's content:
// a plain string or an array of Anthropic content blocks (text/image/…).
type MessageContent = SDKUserMessage['message']['content']

// Turn a typed text + resolved uploads into (a) the content the agent receives
// and (b) the display parts we broadcast for the user's bubble. Images become
// base64 vision blocks; other files are referenced by their temp path so the
// agent can Read them. Display text stays the user's text (no path note).
// Exported for unit tests.
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
    text,
    files.map(f => ({ filename: f.filename, path: f.path! }))
  )
  // Always end with a text block so an image-only message still has a prompt.
  blocks.push({ type: 'text', text: agentText || ATTACHMENT_ONLY_PLACEHOLDER })
  return { content: blocks, parts }
}

// Cap on concurrently-held live sessions (each = one claude subprocess). When
// exceeded, the least-recently-active IDLE session is closed; a busy session is
// never evicted. Idle sessions are also closed after this TTL.
const MAX_LIVE_SESSIONS = 8
const IDLE_TTL_MS = 5 * 60_000

// SDK task types that keep running after the turn ends (background Bash,
// workflow runs). Subagent Tasks complete within their turn, so they are
// deliberately excluded — a leaked entry would keep the session alive forever.
const BG_TASK_TYPES = new Set(['local_bash', 'local_workflow'])

const ALLOWED_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch'
]

type InputQueue = {
  iterator: AsyncGenerator<SDKUserMessage>
  push: (content: MessageContent) => void
  clear: () => void
  close: () => void
}

type LiveSession = {
  workspaceId: string
  workspacePath: string
  sessionId: string // current real id (rekeyed on rename)
  q: Query
  adapter: ClaudeAdapter
  input: InputQueue
  abort: AbortController
  // Session activity, mirrored from the SDK's `session_state_changed` events
  // (authoritative — it fires `idle` only after the CLI's input queue drains,
  // so queued messages merged into one model turn can't wedge it, unlike the
  // old send/result counter). `sendCCMessage` flips it to 'running'
  // optimistically so the loader doesn't wait a subprocess round-trip.
  activity: SessionActivity
  // Whether this query has emitted `session_state_changed` at all. When it
  // never does (older CLI), the `result` handler falls back to declaring idle.
  sawStateEvents: boolean
  // Live background tasks (background Bash, workflows) keyed by task id, fed by
  // the SDK's typed task events. Non-empty keeps the session alive past the
  // idle TTL — tearing down the subprocess would kill its background children.
  bgTasks: Set<string>
  model: string | undefined
  // Reasoning effort the query was created with. The SDK has no live setter for
  // it (unlike setModel), so a change tears the session down and resumes.
  effort: string | undefined
  // Effort the latest message asked for. When it diverges from `effort` while a
  // turn is in flight (can't rebuild mid-turn), the session is torn down once it
  // drains so the next message resumes with the requested effort.
  desiredEffort: string | undefined
  // Whether this query was built with `includePartialMessages` (live token
  // streaming). Like effort, it's a construct-time option with no live setter,
  // so a change tears the session down and resumes.
  stream: boolean
  // Streaming mode the latest message asked for; drives the same drain-then-
  // rebuild path as `desiredEffort` when it diverges mid-turn.
  desiredStream: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
  // Last turn's error text (result subtype), consumed by the view-builder
  // status update on the idle transition.
  lastBuilderError: string | undefined
  // Introspection only (surfaced by /status) — not load-bearing.
  createdAt: number
  lastActivityAt: number
  lastUserText: string | undefined
}

const sessions = new Map<string, LiveSession>()
// `${workspaceId}:${tempId}` -> real session id. A new thread is created under
// the client's temporary id, then renamed to the SDK's real id on init. A
// follow-up queued in the window before the client learns the new id still
// carries the temp id; this alias re-routes it to the live session instead of
// spawning a duplicate. Temp ids are UUIDs, so stale entries never collide.
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
  for (const s of sessions.values()) {
    if (s.activity !== 'idle') {
      out.push({ workspaceId: s.workspaceId, sessionId: s.sessionId, activity: s.activity })
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
  effort: string | undefined
  desiredEffort: string | undefined
  stream: boolean
  desiredStream: boolean
  activity: SessionActivity
  bgTasks: number
  closed: boolean
  hasIdleTimer: boolean
  createdAt: number
  lastActivityAt: number
  lastUserText: string | undefined
}

// A full snapshot of the in-memory live-session registry, for the /status page.
// Read-only — never mutate the returned objects.
export function getCCDebugSnapshot(): { sessions: CCDebugSession[]; aliases: number } {
  return {
    sessions: [...sessions.values()].map(s => ({
      workspaceId: s.workspaceId,
      sessionId: s.sessionId,
      model: s.model,
      effort: s.effort,
      desiredEffort: s.desiredEffort,
      stream: s.stream,
      desiredStream: s.desiredStream,
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

// A push-able async generator used as the streaming-input prompt: it yields
// queued user messages and awaits when empty, so the session stays open between
// turns instead of ending when the current input is consumed.
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
    push(content: MessageContent) {
      buffer.push({
        type: 'user',
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

// Set the session's activity and broadcast the transition (deduped — repeated
// same-value events from the SDK don't re-broadcast).
function setActivity(s: LiveSession, activity: SessionActivity) {
  if (s.activity === activity) return
  s.activity = activity
  broadcast(s.workspaceId, { type: 'status', sessionId: s.sessionId, activity })
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
    if (s.activity === 'running') return
    if (s.bgTasks.size > 0) {
      // Tearing down would kill the subprocess and its background children
      // (renders, watch loops). Keep the session alive until they finish.
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
}

// On `system/init` the SDK reports the real session id. For a brand-new session
// that differs from the client's temporary id, so we rekey the registry and
// tell the client to move its optimistic state. Subsequent inits report the
// same id and no-op.
function renameSession(s: LiveSession, realId: string) {
  const from = s.sessionId
  sessions.delete(recKey(s.workspaceId, from))
  s.sessionId = realId
  sessions.set(recKey(s.workspaceId, realId), s)
  aliases.set(recKey(s.workspaceId, from), realId)
  broadcast(s.workspaceId, { type: 'session_renamed', from, to: realId })
}

// The session just went idle (state event, or `result` on a CLI without state
// events): settle the view builder, then either rebuild for a deferred
// effort/streaming change or arm the idle timer.
async function onSessionIdle(s: LiveSession) {
  await markViewBuilderWaitingBySession(
    s.workspaceId,
    s.workspacePath,
    s.sessionId,
    s.lastBuilderError
  )
  if (s.desiredEffort !== s.effort || s.desiredStream !== s.stream) teardown(s)
  else armIdle(s)
}

async function consume(s: LiveSession) {
  try {
    for await (const msg of s.q) {
      // Raw SDK message into the debug wire ring (/playground/harness).
      tapWire(s.workspaceId, 'recv', msg)
      if (msg.type === 'system' && msg.subtype === 'init') {
        const realId = msg.session_id
        if (realId && realId !== s.sessionId) {
          const from = s.sessionId
          renameSession(s, realId)
          // Carry any config the picker wrote under the temp id to the real id.
          await renameThreadConfig(s.workspacePath, from, s.sessionId)
          await renameViewBuilderSession(s.workspaceId, s.workspacePath, from, s.sessionId)
        }
        // Seed the thread's config from what it actually ran with — but only if
        // it has none yet, so an explicit user PUT (or a migrated temp-id edit)
        // always wins. A default run (no model/effort) leaves no file and falls
        // back to the workspace defaults.
        if ((s.model || s.effort) && !(await hasThreadConfig(s.workspacePath, s.sessionId))) {
          await saveThreadConfig(s.workspacePath, s.sessionId, {
            model: s.model,
            effort: s.effort
          })
        }
      }
      for (const ev of s.adapter.ingest(msg)) {
        if (ev.kind === 'preview') {
          // Live-only token preview — a sibling frame, never a StreamEvent, so
          // it never enters the persisted/replayable transcript path.
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
      // A turn is producing output while we think the session is idle: a
      // queued message the CLI ran as its own turn after the previous result,
      // or an SDK-initiated turn (e.g. a background-task notification waking
      // the model). Re-assert running so the spinner tracks real activity.
      if ((msg.type === 'assistant' || msg.type === 'stream_event') && s.activity === 'idle') {
        setActivity(s, 'running')
      }
      // Authoritative activity mirror. The CLI emits `idle` only once its own
      // input queue drains, so queued messages the model merged into one turn
      // (one `result` for N sends) still end in a clean idle here. Observed
      // empirically: current CLIs don't emit this in streaming-input mode, so
      // the `result` fallback below is the everyday path.
      if (msg.type === 'system' && msg.subtype === 'session_state_changed') {
        s.sawStateEvents = true
        s.lastActivityAt = Date.now()
        debug(`cc state ws=${s.workspaceId} session=${s.sessionId} state=${msg.state}`)
        if (msg.state === 'running') setActivity(s, 'running')
        else if (msg.state === 'requires_action') setActivity(s, 'requires-action')
        else if (msg.state === 'idle') {
          setActivity(s, 'idle')
          await onSessionIdle(s)
        }
      }
      // Background-task lifecycle (typed SDK events): track live background
      // work so idle eviction doesn't kill it (armIdle keep-alive). Only task
      // types that outlive the turn count; subagent Tasks end within it.
      if (msg.type === 'system' && msg.subtype === 'task_started') {
        if (BG_TASK_TYPES.has(msg.task_type ?? '')) {
          s.bgTasks.add(msg.task_id)
          debug(
            `cc bg-task start ws=${s.workspaceId} session=${s.sessionId} task=${msg.task_id} type=${msg.task_type} live=${s.bgTasks.size}`
          )
        }
      }
      if (msg.type === 'system' && msg.subtype === 'task_notification') {
        if (s.bgTasks.delete(msg.task_id)) {
          debug(
            `cc bg-task end ws=${s.workspaceId} session=${s.sessionId} task=${msg.task_id} status=${msg.status} live=${s.bgTasks.size}`
          )
        }
      }
      if (msg.type === 'system' && msg.subtype === 'task_updated') {
        const status = msg.patch?.status
        if (status === 'completed' || status === 'failed' || status === 'killed') {
          s.bgTasks.delete(msg.task_id)
        }
      }
      if (msg.type === 'result') {
        s.lastActivityAt = Date.now()
        // Remembered for the idle transition — the view builder shows the last
        // turn's error once the queue drains.
        s.lastBuilderError =
          msg.subtype === 'success'
            ? undefined
            : msg.errors.join('\n') || msg.subtype.replaceAll('_', ' ')
        debug(`cc result ws=${s.workspaceId} session=${s.sessionId} subtype=${msg.subtype}`)
        // Fallback for CLIs that never emit `session_state_changed`: treat
        // every result as turn-over. With state events, `idle` follows the
        // result and drives the same path.
        if (!s.sawStateEvents) {
          setActivity(s, 'idle')
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
    // teardown broadcasts the terminal idle status itself (deduped).
    teardown(s)
  }
}

// Close one idle session to stay under the cap. A running session — or one
// with live background tasks — is never evicted; if everything is busy we allow
// a temporary overflow rather than killing a run.
function evictIfNeeded() {
  if (sessions.size < MAX_LIVE_SESSIONS) return
  for (const s of sessions.values()) {
    if (s.activity === 'idle' && s.bgTasks.size === 0) {
      teardown(s)
      return
    }
  }
}

function createLiveSession(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  model: string | undefined
  effort: string | undefined
  // Live token streaming (`includePartialMessages`). Only enabled when the
  // client opts in; off leaves the query byte-for-byte as before.
  stream: boolean
  // Resolved workspace env (.env + UI custom overrides), injected so the agent's
  // Bash tool can use workspace secrets. Frozen at spawn — see restartWorkspaceSessions.
  workspaceEnv: Record<string, string>
}): LiveSession {
  evictIfNeeded()

  const queue = createInputQueue()
  const abort = new AbortController()
  const options: Options = {
    abortController: abort,
    pathToClaudeCodeExecutable: requireHarnessExecutable('claude-code'),
    // Generous: one query() spans the whole live session (many turns). On end
    // (limit hit / closed / error) the session is torn down and the next
    // message recreates it via resume.
    maxTurns: 1000,
    cwd: input.workspacePath,
    // Current-gen models (Sonnet 5, Opus 4.7/4.8, Fable 5) default thinking
    // display to 'omitted' — the API still emits a `thinking` block but with
    // empty text, which the adapter drops (`if (b.thinking)`), so no
    // "Thinking" row ever reaches the timeline. Request the summary
    // explicitly so reasoning stays visible.
    thinking: { type: 'adaptive', display: 'summarized' },
    ...(input.model ? { model: input.model } : {}),
    // The picker only offers a model's own `supportedEffortLevels`, so the value
    // is valid for the model; the SDK silently downgrades otherwise. Cast because
    // the SDK under-types the union (no 'xhigh') vs our pass-through string.
    ...(input.effort ? { effort: input.effort as Options['effort'] } : {}),
    // Emit `stream_event` partial-message frames so the adapter can surface a
    // live token-by-token preview. Off = unchanged behavior (whole blocks only).
    includePartialMessages: input.stream,
    allowedTools: ALLOWED_TOOLS,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: ['user', 'project'],
    env: { ...process.env, ...input.workspaceEnv, CLAUDECODE: undefined },
    stderr: (data: string) => console.error('[SDK stderr]', data)
  }
  if (!input.isNew) options.resume = input.sessionId

  const session: LiveSession = {
    workspaceId: input.workspaceId,
    workspacePath: input.workspacePath,
    sessionId: input.sessionId,
    q: query({ prompt: queue.iterator, options }),
    adapter: new ClaudeAdapter(),
    input: queue,
    abort,
    activity: 'idle',
    sawStateEvents: false,
    bgTasks: new Set(),
    model: input.model,
    effort: input.effort,
    desiredEffort: input.effort,
    stream: input.stream,
    desiredStream: input.stream,
    idleTimer: null,
    closed: false,
    lastBuilderError: undefined,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    lastUserText: undefined
  }
  sessions.set(recKey(session.workspaceId, session.sessionId), session)
  debug(
    `cc create ${input.isNew ? 'new' : 'resume'} ws=${input.workspaceId} session=${input.sessionId} model=${input.model ?? 'default'} effort=${input.effort ?? 'default'} live=${sessions.size}`
  )
  void consume(session)
  return session
}

// Enqueue a user message into the thread's live session, creating it on first
// use. Safe to call while a turn is in flight — the message is queued.
export async function sendCCMessage(input: {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  content: string
  // Upload ids attached to this turn (resolved from the upload store here).
  attachments?: string[]
  optimisticId?: string
  model?: string
  effort?: string
  stream?: boolean
}): Promise<void> {
  // Resolve any attachments into agent content blocks + display parts. Unknown
  // or expired ids are silently dropped (resolveUploads filters them) — if that
  // leaves nothing to say at all, don't spin up a session for an empty turn.
  const uploads = input.attachments?.length
    ? resolveUploads(input.workspaceId, input.attachments)
    : []
  if (!input.content && uploads.length === 0) return
  const displayContent = stripViewBuilderMeta(input.content)
  const { content, parts } = buildUserMessage(input.content, uploads, displayContent)

  const wantStream = input.stream === true
  let s = sessions.get(liveKey(input.workspaceId, input.sessionId))
  // Neither effort nor streaming can be changed on a running query (both are
  // construct-time, no SDK setter), so when either differs we tear the idle
  // session down and recreate it via resume — the change lands on this very
  // turn. A busy session keeps its settings until the in-flight turn ends.
  if (s && (input.effort !== s.effort || wantStream !== s.stream) && s.activity === 'idle') {
    teardown(s)
    s = undefined
  }
  if (s) {
    clearIdle(s)
    if (input.model !== s.model) {
      try {
        await s.q.setModel(input.model)
        s.model = input.model
      } catch (err) {
        console.error('[cc-session] setModel failed', err)
      }
      // setModel is a control round-trip to the subprocess. During that await a
      // concurrent turn `result` can drain this session to idle and — if effort
      // or streaming diverged — tear it down (see the `result` handler). If that
      // happened, drop the dead handle and fall through to recreate a fresh
      // session below, rather than enqueue onto a closed input queue (which would
      // silently lose the message and hang the spinner).
      if (s.closed) s = undefined
    }
    if (s) {
      // Effort/streaming can't change on a running query; record the request so
      // the session rebuilds once its turns drain (see the `result` handler).
      // Reaching here with a divergent value means the session is busy — an idle
      // one was torn down above.
      s.desiredEffort = input.effort
      s.desiredStream = wantStream
    }
  }
  if (!s) {
    s = createLiveSession({
      workspaceId: input.workspaceId,
      workspacePath: input.workspacePath,
      sessionId: input.sessionId,
      isNew: input.isNew,
      model: input.model,
      effort: input.effort,
      stream: wantStream,
      // The agent only sees secrets scoped to the 'agent' sink (plus .env).
      workspaceEnv: await resolveWorkspaceEnv(input.workspacePath)
    })
  }
  // Streaming-input mode does NOT echo the pushed user message back in the
  // output stream (string-prompt mode did — that's what expectUserEcho was
  // for), so the adapter never emits a user turn. Synthesize and broadcast it
  // ourselves so EVERY connected tab shows the user's bubble — not just the
  // sender (which inserts it optimistically). Keyed by optimisticId, so the
  // sender's optimistic turn upserts in place rather than duplicating.
  const turnId = input.optimisticId ?? crypto.randomUUID()
  broadcast(s.workspaceId, {
    kind: 'turn',
    sessionId: s.sessionId,
    turn: {
      id: turnId,
      role: 'user',
      origin: { kind: 'user-input' },
      parts,
      timestamp: new Date().toISOString()
    }
  })
  // Safety net: if a future SDK does echo the user message, the adapter re-ids
  // that echo to the same optimisticId so it collapses onto the turn above
  // instead of duplicating.
  if (input.optimisticId) s.adapter.expectUserEcho(input.optimisticId, displayContent)

  s.lastActivityAt = Date.now()
  // For an attachment-only message, fall back to the filenames so the thread
  // list / status view don't show a blank label.
  const label = displayContent || uploads.map(u => u.filename).join(', ')
  s.lastUserText = label.replace(/\s+/g, ' ').slice(0, 120)

  // Optimistic flip — the authoritative `session_state_changed: running` from
  // the subprocess confirms it moments later (setActivity dedupes).
  if (s.activity !== 'running') {
    await markViewBuilderBuildingBySession(s.workspaceId, s.workspacePath, s.sessionId)
    setActivity(s, 'running')
  }
  clearIdle(s)
  s.input.push(content)
  tapWire(s.workspaceId, 'send', { type: 'user', content })
  debug(
    `cc enqueue ws=${s.workspaceId} session=${s.sessionId} activity=${s.activity} text=${JSON.stringify(s.lastUserText)}`
  )
}

// How long Stop waits for the SDK's interrupt round-trip before declaring the
// subprocess wedged and tearing it down. A hung subprocess never answers, and
// without this cap the whole interrupt path (and the user's only escape hatch
// from a stuck spinner) hangs with it.
const INTERRUPT_TIMEOUT_MS = 5_000

// Interrupt the current turn and drop any queued messages, keeping the session
// alive for the next message. If the subprocess doesn't acknowledge in time it
// is torn down instead — the next message respawns via resume.
export async function interruptCCSession(workspaceId: string, sessionId: string): Promise<void> {
  const s = sessions.get(liveKey(workspaceId, sessionId))
  if (!s) return
  debug(`cc interrupt ws=${workspaceId} session=${sessionId} activity=${s.activity}`)
  s.input.clear()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = Symbol('interrupt-timeout')
  try {
    const outcome = await Promise.race([
      s.q.interrupt(),
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
  } finally {
    clearTimeout(timer)
  }
  broadcast(s.workspaceId, { kind: 'stopped', sessionId: s.sessionId })
  setActivity(s, 'idle')
  await markViewBuilderWaitingBySession(s.workspaceId, s.workspacePath, s.sessionId)
  if (!s.closed) armIdle(s)
}

// Tear down a workspace's IDLE sessions so the next message respawns the agent
// with fresh env. A running claude subprocess can't pick up new env vars, and
// mid-turn reload isn't supported — busy sessions keep their snapshot until the
// turn ends (then idle-evict or get recreated on the next message via resume).
export function restartWorkspaceSessions(workspacePath: string): void {
  for (const s of [...sessions.values()]) {
    if (s.workspacePath === workspacePath && s.activity === 'idle') teardown(s)
  }
}

// Close every live session — called on server shutdown so no claude subprocess
// is orphaned.
export function killAllCCSessions(): void {
  for (const s of [...sessions.values()]) teardown(s)
}
