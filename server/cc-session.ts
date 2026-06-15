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

import { ClaudeAdapter } from '@/lib/claude-adapter'

import { broadcast } from './state'

// Cap on concurrently-held live sessions (each = one claude subprocess). When
// exceeded, the least-recently-active IDLE session is closed; a busy session is
// never evicted. Idle sessions are also closed after this TTL.
const MAX_LIVE_SESSIONS = 8
const IDLE_TTL_MS = 5 * 60_000

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
  push: (text: string) => void
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
  // User messages enqueued but not yet completed. A turn ends on a `result`
  // message; processing = pendingTurns > 0.
  pendingTurns: number
  model: string | undefined
  idleTimer: ReturnType<typeof setTimeout> | null
  closed: boolean
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

// Running sessions across all workspaces, for the connect-time status snapshot.
export function getCCRunningSessions(): { workspaceId: string; sessionId: string }[] {
  const out: { workspaceId: string; sessionId: string }[] = []
  for (const s of sessions.values()) {
    if (s.pendingTurns > 0) out.push({ workspaceId: s.workspaceId, sessionId: s.sessionId })
  }
  return out
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
    push(text: string) {
      buffer.push({
        type: 'user',
        message: { role: 'user', content: text },
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

function broadcastProcessing(s: LiveSession, processing: boolean) {
  broadcast(s.workspaceId, { type: 'status', sessionId: s.sessionId, processing })
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
    if (s.pendingTurns === 0) teardown(s)
  }, IDLE_TTL_MS)
}

function teardown(s: LiveSession) {
  if (s.closed) return
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

async function consume(s: LiveSession) {
  try {
    for await (const msg of s.q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        const realId = msg.session_id
        if (realId && realId !== s.sessionId) renameSession(s, realId)
      }
      for (const ev of s.adapter.ingest(msg)) {
        broadcast(s.workspaceId, { ...ev, sessionId: s.sessionId })
      }
      if (msg.type === 'result') {
        s.pendingTurns = Math.max(0, s.pendingTurns - 1)
        if (s.pendingTurns === 0) {
          broadcastProcessing(s, false)
          armIdle(s)
        }
      }
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      broadcast(s.workspaceId, {
        kind: 'error',
        sessionId: s.sessionId,
        content: err instanceof Error ? err.message : 'Unknown error'
      })
    }
  } finally {
    if (s.pendingTurns > 0) {
      s.pendingTurns = 0
      broadcastProcessing(s, false)
    }
    teardown(s)
  }
}

// Close one idle session to stay under the cap. A busy session is never evicted;
// if everything is busy we allow a temporary overflow rather than killing a run.
function evictIfNeeded() {
  if (sessions.size < MAX_LIVE_SESSIONS) return
  for (const s of sessions.values()) {
    if (s.pendingTurns === 0) {
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
}): LiveSession {
  evictIfNeeded()

  const queue = createInputQueue()
  const abort = new AbortController()
  const options: Options = {
    abortController: abort,
    // Generous: one query() spans the whole live session (many turns). On end
    // (limit hit / closed / error) the session is torn down and the next
    // message recreates it via resume.
    maxTurns: 1000,
    cwd: input.workspacePath,
    ...(input.model ? { model: input.model } : {}),
    allowedTools: ALLOWED_TOOLS,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    settingSources: ['user', 'project'],
    env: { ...process.env, CLAUDECODE: undefined },
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
    pendingTurns: 0,
    model: input.model,
    idleTimer: null,
    closed: false
  }
  sessions.set(recKey(session.workspaceId, session.sessionId), session)
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
  optimisticId?: string
  model?: string
}): Promise<void> {
  let s = sessions.get(liveKey(input.workspaceId, input.sessionId))
  if (!s) {
    s = createLiveSession({
      workspaceId: input.workspaceId,
      workspacePath: input.workspacePath,
      sessionId: input.sessionId,
      isNew: input.isNew,
      model: input.model
    })
  } else {
    clearIdle(s)
    if (input.model !== s.model) {
      try {
        await s.q.setModel(input.model)
        s.model = input.model
      } catch (err) {
        console.error('[cc-session] setModel failed', err)
      }
    }
  }

  if (input.optimisticId) s.adapter.expectUserEcho(input.optimisticId, input.content)
  const wasIdle = s.pendingTurns === 0
  s.pendingTurns++
  if (wasIdle) broadcastProcessing(s, true)
  s.input.push(input.content)
}

// Interrupt the current turn and drop any queued messages, but keep the session
// alive for the next message.
export async function interruptCCSession(workspaceId: string, sessionId: string): Promise<void> {
  const s = sessions.get(liveKey(workspaceId, sessionId))
  if (!s) return
  s.input.clear()
  try {
    await s.q.interrupt()
  } catch (err) {
    console.error('[cc-session] interrupt failed', err)
  }
  s.pendingTurns = 0
  broadcast(s.workspaceId, { kind: 'stopped', sessionId: s.sessionId })
  broadcastProcessing(s, false)
  armIdle(s)
}

// Close every live session — called on server shutdown so no claude subprocess
// is orphaned.
export function killAllCCSessions(): void {
  for (const s of [...sessions.values()]) teardown(s)
}
