// Record one OpenClaw chat turn off a local gateway, in the fixture format
// `server/harness/openclaw/wire-replay.test.ts` replays.
//
//   bun scripts/openclaw-capture.ts <model> <prompt> <out.jsonl> [--observe]
//
//   bun scripts/openclaw-capture.ts ollama-cloud/glm-5.2:cloud \
//     "Run 'echo hi' and say what it printed." \
//     server/harness/openclaw/fixtures/ollama-single-tool.jsonl
//
// The connection is built with the same options as the real harness
// (`gateway.ts` → `gatewayClientBaseOptions`), including `caps: ['tool-events']`
// — without that the gateway never sends tool frames at all.
//
// `--observe` records the run from a SECOND connection that subscribes but does
// not send. That connection is not a run-scoped tool recipient, so the gateway
// mirrors tool activity to it as `session.tool` instead of `agent`/tool (see
// NOTES.md §6). Both shapes need fixtures; they are the same run seen from the
// two audiences.
//
// Output lines: one `meta`, then every `event` frame in arrival order, then the
// `durable` transcript `sessions.get` returned at the end. Frames are trimmed
// to the fields the harness reads — notably the fat session row embedded in
// every frame is dropped, so fixtures stay readable.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { gatewayClientBaseOptions } from '@/server/harness/openclaw/gateway'

const args = process.argv.slice(2)
const observe = args.includes('--observe')
const [model, prompt, outFile] = args.filter(a => a !== '--observe')
if (!model || !prompt || !outFile) {
  throw new Error('usage: openclaw-capture.ts <model> <prompt> <out.jsonl> [--observe]')
}

const cfg = JSON.parse(readFileSync(join(homedir(), '.openclaw/openclaw.json'), 'utf8')) as {
  gateway: { port: number; auth: { token: string } }
}
const { GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime')

// Frame families the harness consumes; anything else is noise for a fixture.
const KEEP = new Set(['session.message', 'session.tool', 'chat', 'sessions.changed', 'agent'])
const FIELDS = new Set([
  'sessionKey',
  'message',
  'messageSeq',
  'stream',
  'data',
  'state',
  'runId',
  'reason',
  'phase',
  'errorMessage'
])

const t0 = Date.now()
let ended = false

type Handler = (event: string, payload: Record<string, unknown>) => void

function connect(onEvent: Handler) {
  let ready!: () => void
  const connected = new Promise<void>(r => {
    ready = r
  })
  const client = new GatewayClient({
    ...gatewayClientBaseOptions(`ws://127.0.0.1:${cfg.gateway.port}`, cfg.gateway.auth.token),
    requestTimeoutMs: 30_000,
    onHelloOk: () => ready(),
    onEvent: (evt: unknown) => {
      const e = evt as { event?: string; payload?: Record<string, unknown> }
      if (e.event) onEvent(e.event, e.payload ?? {})
    }
  })
  client.start()
  return {
    client,
    connected,
    rpc: <T>(method: string, params: Record<string, unknown> = {}) =>
      client.request(method, params) as Promise<T>
  }
}

function record(event: string, payload: Record<string, unknown>) {
  if (!KEEP.has(event)) return
  const trimmed: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload)) if (FIELDS.has(k)) trimmed[k] = v
  appendFileSync(
    outFile,
    `${JSON.stringify({ t: Date.now() - t0, kind: 'event', data: { event, payload: trimmed } })}\n`
  )
}

// The run is over when the lifecycle stream says so — polling `sessions.list`
// races a session that has not reported a status yet and truncates the capture.
function watchLifecycle(event: string, payload: Record<string, unknown>) {
  const p = payload as { stream?: string; data?: { phase?: string } }
  if (event !== 'agent' || p.stream !== 'lifecycle') return
  if (p.data?.phase === 'end' || p.data?.phase === 'error') ended = true
}

writeFileSync(outFile, '')
const sender = connect(observe ? watchLifecycle : (e, p) => (watchLifecycle(e, p), record(e, p)))
const observer = observe ? connect((e, p) => record(e, p)) : null
await Promise.all([sender.connected, observer?.connected].filter(Boolean))

const created = await sender.rpc<{ key: string }>('sessions.create', { agentId: 'main', model })
const sessionKey = created.key
for (const cl of [sender, observer]) {
  if (!cl) continue
  await cl.rpc('sessions.subscribe', {})
  await cl.rpc('sessions.messages.subscribe', { key: sessionKey })
}
await sender.rpc('sessions.send', { key: sessionKey, message: prompt })

await new Promise<void>(resolve => {
  const giveUp = setTimeout(resolve, 240_000)
  const poll = setInterval(() => {
    if (!ended) return
    clearInterval(poll)
    clearTimeout(giveUp)
    setTimeout(resolve, 8000) // let trailing durable rows land
  }, 250)
})

const durable = await sender.rpc<{ messages: unknown[] }>('sessions.get', {
  key: sessionKey,
  limit: 500
})
const label = `${model}${observe ? ', observed from a non-sending connection' : ''}`
writeFileSync(
  outFile,
  `${JSON.stringify({ t: 0, kind: 'meta', data: { label, sessionKey } })}\n` +
    readFileSync(outFile, 'utf8') +
    `${JSON.stringify({ t: Date.now() - t0, kind: 'durable', data: durable })}\n`
)
sender.client.stop()
observer?.client.stop()
console.log(`captured ${sessionKey} → ${outFile}`)
process.exit(0)
