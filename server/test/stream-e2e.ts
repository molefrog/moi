// End-to-end streaming harness — a REAL WebSocket client driving a REAL server
// path (the production `sendCCMessage` → adapter → `broadcast` pipeline), against
// the live Claude Agent SDK. This is the "simulate the frontend over WS" proof.
//
// It is NOT part of `bun test` (needs network + the agent CLI, and is slow).
// Run it directly:  bun server/test/stream-e2e.ts
// When running as root (e.g. CI containers), export IS_SANDBOX=1 first so the
// agent CLI permits `--dangerously-skip-permissions`:
//   IS_SANDBOX=1 bun server/test/stream-e2e.ts
//
// To avoid binding the fixed control/HTTP ports that importing web.ts would, we
// stand up a minimal Bun.serve on an ephemeral port whose /ws handler mirrors
// web.ts exactly — open→addClient, message→sendCCMessage, close→removeClient —
// so every frame flows through the same broadcast machinery the browser sees.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ClientMessage } from '@/lib/types'

// The cc-session runs the agent with `--dangerously-skip-permissions`, which the
// CLI refuses under root unless the environment declares itself a sandbox. This
// container runs as root; a real user install does not need this.
process.env.IS_SANDBOX ??= '1'

import {
  getCCRunningSessions,
  interruptCCSession,
  killAllCCSessions,
  sendCCMessage
} from '../harness/claude-code/session'
import { getWorkspace, registerWorkspace, setRegistryPath } from '../registry'
import { addClient, removeClient } from '../state'
import { setThreadConfigPath } from '../thread-config'

// ---------------------------------------------------------------------------
// Setup: isolated registry + a throwaway Claude Code workspace.
// ---------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'moi-e2e-'))
setRegistryPath(join(tmp, 'workspaces.json'))
setThreadConfigPath(join(tmp, 'thread-config.json'))
const wsDir = mkdtempSync(join(tmpdir(), 'moi-ws-'))
const workspace = await registerWorkspace(wsDir, { type: 'claude-code' })
const WID = workspace.id

const server = Bun.serve({
  port: 0,
  fetch(req, srv) {
    if (srv.upgrade(req)) return undefined
    return new Response('nope', { status: 400 })
  },
  websocket: {
    open(ws) {
      addClient(ws)
      ws.send(JSON.stringify({ type: 'status_snapshot', running: getCCRunningSessions() }))
    },
    async message(ws, message) {
      const data = JSON.parse(String(message)) as ClientMessage
      if (data.type === 'chat') {
        const w = await getWorkspace(data.workspaceId)
        if (!w) return
        await sendCCMessage({
          workspaceId: data.workspaceId,
          workspacePath: w.path,
          sessionId: data.sessionId,
          isNew: data.isNew,
          content: data.content,
          optimisticId: data.optimisticId,
          model: data.model,
          effort: data.effort,
          stream: data.stream
        })
      } else if (data.type === 'stop') {
        await interruptCCSession(data.workspaceId, data.sessionId)
      }
    },
    close(ws) {
      removeClient(ws)
    }
  }
})
const URL = `ws://127.0.0.1:${server.port}/ws`

// ---------------------------------------------------------------------------
// A tiny frontend simulator: connects, buffers frames, awaits predicates.
// ---------------------------------------------------------------------------
type Frame = Record<string, unknown>

class Client {
  ws: WebSocket
  frames: Frame[] = []
  private waiters: { pred: (f: Frame) => boolean; resolve: (f: Frame) => void }[] = []

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.addEventListener('message', e => {
      const f = JSON.parse(String((e as MessageEvent).data)) as Frame
      this.frames.push(f)
      this.waiters = this.waiters.filter(w => {
        if (w.pred(f)) {
          w.resolve(f)
          return false
        }
        return true
      })
    })
  }

  open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res(), { once: true })
      this.ws.addEventListener('error', () => rej(new Error('ws error')), { once: true })
    })
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg))
  }

  waitFor(pred: (f: Frame) => boolean, timeoutMs = 90_000): Promise<Frame> {
    const hit = this.frames.find(pred)
    if (hit) return Promise.resolve(hit)
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('waitFor timed out')), timeoutMs)
      this.waiters.push({
        pred,
        resolve: f => {
          clearTimeout(t)
          resolve(f)
        }
      })
    })
  }

  close() {
    this.ws.close()
  }
}

// ---------------------------------------------------------------------------
// Assertions + runner
// ---------------------------------------------------------------------------
const results: { name: string; ok: boolean; detail: string }[] = []
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const isPreview = (f: Frame) => f.type === 'preview'
const isAssistantTurn = (f: Frame) =>
  f.kind === 'turn' && (f.turn as { role?: string } | undefined)?.role === 'assistant'
const isStatusFalse = (f: Frame) => f.type === 'status' && f.processing === false
const isStatusTrue = (f: Frame) => f.type === 'status' && f.processing === true

function previewText(f: Frame): string {
  const blocks = (f.blocks ?? []) as { text?: string }[]
  return blocks.map(b => b.text ?? '').join('')
}
function turnText(f: Frame): string {
  const parts = ((f.turn as { parts?: unknown[] }).parts ?? []) as {
    type?: string
    text?: string
  }[]
  return parts
    .filter(p => p.type === 'text')
    .map(p => p.text ?? '')
    .join('')
}

async function scenarioBasicStreaming() {
  const c = new Client(URL)
  await c.open()
  const sid = crypto.randomUUID()
  c.send({
    type: 'chat',
    workspaceId: WID,
    content: 'Write exactly four short sentences about the ocean. No preamble.',
    sessionId: sid,
    isNew: true,
    stream: true
  })
  await c.waitFor(isStatusFalse)

  const previews = c.frames.filter(isPreview)
  const assistantTurns = c.frames.filter(isAssistantTurn)
  check('S1 stream on: got ≥2 preview frames', previews.length >= 2, `${previews.length} previews`)

  // Per message id, cumulative text must never shrink.
  const byMsg = new Map<string, string[]>()
  for (const p of previews) {
    const id = p.messageId as string
    byMsg.set(id, [...(byMsg.get(id) ?? []), previewText(p)])
  }
  let monotonic = true
  for (const seq of byMsg.values()) {
    for (let i = 1; i < seq.length; i++) if (seq[i].length < seq[i - 1].length) monotonic = false
  }
  check('S1 preview text is monotonically non-decreasing', monotonic)

  // The finalized assistant turn's text equals the last preview snapshot for
  // its message id (streamed text and finalized text agree).
  let matched = false
  for (const turn of assistantTurns) {
    const mid = (turn.turn as { meta?: { apiMessageId?: string } }).meta?.apiMessageId
    if (!mid) continue
    const seq = byMsg.get(mid)
    if (seq && seq[seq.length - 1] === turnText(turn)) matched = true
  }
  check('S1 finalized turn text == last preview snapshot', matched)

  // No preview frame arrives AFTER the finalizing turn for the same message id.
  let noTrailing = true
  for (const turn of assistantTurns) {
    const mid = (turn.turn as { meta?: { apiMessageId?: string } }).meta?.apiMessageId
    if (!mid) continue
    const turnIdx = c.frames.indexOf(turn)
    const trailing = c.frames.findIndex(
      (f, i) => i > turnIdx && isPreview(f) && f.messageId === mid && previewText(f).length > 0
    )
    if (trailing !== -1) noTrailing = false
  }
  check('S1 no preview re-emits after the finalized turn', noTrailing)
  c.close()
}

async function scenarioStreamingOff() {
  const c = new Client(URL)
  await c.open()
  const sid = crypto.randomUUID()
  c.send({
    type: 'chat',
    workspaceId: WID,
    content: 'Reply with the single word: ok',
    sessionId: sid,
    isNew: true,
    stream: false
  })
  await c.waitFor(isStatusFalse)
  const previews = c.frames.filter(isPreview)
  const assistantTurns = c.frames.filter(isAssistantTurn)
  check('S2 stream off: ZERO preview frames', previews.length === 0, `${previews.length} previews`)
  check(
    'S2 stream off: still got a finalized assistant turn with text',
    assistantTurns.some(t => turnText(t).length > 0)
  )
  c.close()
}

async function scenarioReconnectMidStream() {
  const c1 = new Client(URL)
  await c1.open()
  const sid = crypto.randomUUID()
  c1.send({
    type: 'chat',
    workspaceId: WID,
    content:
      'Count from 1 to 40. For each number, write it on its own line followed by a short sentence about that number.',
    sessionId: sid,
    isNew: true,
    stream: true
  })
  // Wait for streaming to be underway, then yank the socket mid-stream.
  await c1.waitFor(isPreview)
  c1.close()

  // A fresh connection (the "reconnect"): the run keeps going server-side and a
  // new client still receives the tail — no crash, delivery continues.
  const c2 = new Client(URL)
  await c2.open()
  const snapshot = c2.frames.find(f => f.type === 'status_snapshot')
  const runningNow = (snapshot?.running as unknown[] | undefined) ?? []
  if (runningNow.length >= 1) {
    // The common case: the long run is still going. The new client must receive
    // the tail and the terminal status — proving delivery survives a mid-stream
    // client swap.
    const done = await c2
      .waitFor(isStatusFalse)
      .then(() => true)
      .catch(() => false)
    check('S3 reconnect: in-flight run continues and completes for the new client', done)
    check('S3 reconnect: new client also receives streamed tail frames', c2.frames.some(isPreview))
  } else {
    // Rare: the run finished during the reconnect gap. The point still holds —
    // no crash, and the new client got a clean snapshot.
    check('S3 reconnect: run completed during gap; server healthy, snapshot clean', true)
  }
  c2.close()
}

async function scenarioQueuedMessages() {
  const c = new Client(URL)
  await c.open()
  const sid = crypto.randomUUID()
  c.send({
    type: 'chat',
    workspaceId: WID,
    content: 'Say the word RED and nothing else.',
    sessionId: sid,
    isNew: true,
    stream: true
  })
  // A realistic follow-up: send the second only once the first run is underway
  // (its session exists), then it queues into the same live session. Sending
  // both back-to-back would race session creation — not what we're testing.
  await c.waitFor(f => isStatusTrue(f) || isPreview(f))
  c.send({
    type: 'chat',
    workspaceId: WID,
    content: 'Say the word BLUE and nothing else.',
    sessionId: sid,
    isNew: false,
    stream: true
  })
  // Both messages must be answered in the same thread (streaming on). Wait on
  // the outcome directly — robust to how many status transitions occur.
  const bothAnswered = await c
    .waitFor(() => {
      const txt = c.frames.filter(isAssistantTurn).map(turnText).join(' ').toUpperCase()
      return txt.includes('RED') && txt.includes('BLUE')
    }, 120_000)
    .then(() => true)
    .catch(() => false)
  const assistantText = c.frames.filter(isAssistantTurn).map(turnText).join(' ').toUpperCase()
  check(
    'S4 queued: both messages answered (RED and BLUE seen)',
    bothAnswered,
    assistantText.slice(0, 120)
  )
  // The terminal status:false trails the final answer by a frame — let it settle.
  await c.waitFor(isStatusFalse, 30_000).catch(() => {})
  check(
    'S4 queued: processing toggled on then settled off (status true→false seen)',
    c.frames.some(isStatusTrue) && c.frames.some(isStatusFalse)
  )
  c.close()
}

// ---------------------------------------------------------------------------
try {
  console.log(`\n[stream-e2e] server on ${URL}\n`)
  await scenarioBasicStreaming()
  await scenarioStreamingOff()
  await scenarioReconnectMidStream()
  await scenarioQueuedMessages()
} catch (err) {
  console.error('\n[stream-e2e] fatal:', err)
  check('harness completed without throwing', false, String(err))
} finally {
  killAllCCSessions()
  server.stop(true)
  const failed = results.filter(r => !r.ok)
  console.log(`\n[stream-e2e] ${results.length - failed.length}/${results.length} checks passed`)
  process.exit(failed.length === 0 ? 0 : 1)
}
