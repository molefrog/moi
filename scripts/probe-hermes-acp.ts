// Drive `hermes acp` (Agent Client Protocol over stdio JSON-RPC) directly,
// without moi in the loop — the evidence behind server/harness/hermes/NOTES.md.
//
// Usage:
//   bun scripts/probe-hermes-acp.ts caps
//   bun scripts/probe-hermes-acp.ts stream ["prompt"]
//   bun scripts/probe-hermes-acp.ts replay <sessionId>
//   bun scripts/probe-hermes-acp.ts cancel
//   bun scripts/probe-hermes-acp.ts modes [dont_ask|default]
//
// Env: HERMES_BIN (default `hermes`), PROBE_CWD (default cwd).

import { spawn } from 'node:child_process'

type Frame = Record<string, unknown>
type Update = { sessionUpdate?: string } & Record<string, unknown>

const HERMES = process.env.HERMES_BIN ?? 'hermes'
const CWD = process.env.PROBE_CWD ?? process.cwd()
const mode = process.argv[2] ?? 'caps'

class AcpProbe {
  private child = spawn(HERMES, ['acp'], {
    cwd: CWD,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env }
  })
  private nextId = 1
  private pending = new Map<number, (f: Frame) => void>()
  private buf = ''
  updates: Update[] = []
  permissionRequests = 0
  // 'allow' auto-approves; 'deny' rejects — used by the modes A/B.
  permissionPolicy: 'allow' | 'deny' = 'allow'

  constructor() {
    this.child.stdout.on('data', (c: Buffer) => this.onData(c))
    this.child.stderr.on('data', () => {})
  }

  private onData(chunk: Buffer) {
    this.buf += chunk.toString()
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).trim()
      this.buf = this.buf.slice(nl + 1)
      if (!line) continue
      let frame: Frame
      try {
        frame = JSON.parse(line)
      } catch {
        continue
      }
      if (typeof frame.id === 'number' && frame.method) this.onServerRequest(frame)
      else if (typeof frame.id === 'number') this.pending.get(frame.id)?.(frame)
      else if (frame.method === 'session/update') {
        this.updates.push((frame.params as { update?: Update })?.update ?? {})
      }
    }
  }

  // The agent calls back into us for permissions and (optionally) fs access.
  private onServerRequest(frame: Frame) {
    const id = frame.id as number
    const params = (frame.params ?? {}) as Record<string, unknown>
    if (frame.method === 'session/request_permission') {
      this.permissionRequests++
      const options = (params.options ?? []) as { optionId: string; kind?: string }[]
      const pick =
        this.permissionPolicy === 'deny'
          ? (options.find(o => o.kind?.includes('reject')) ?? options[options.length - 1])
          : (options.find(o => o.kind?.includes('allow')) ?? options[0])
      this.send({
        jsonrpc: '2.0',
        id,
        result: { outcome: { outcome: 'selected', optionId: pick?.optionId } }
      })
      return
    }
    this.send({ jsonrpc: '2.0', id, result: {} })
  }

  send(frame: Frame) {
    this.child.stdin.write(JSON.stringify(frame) + '\n')
  }

  call(method: string, params: unknown): Promise<Frame> {
    const id = this.nextId++
    return new Promise(resolve => {
      this.pending.set(id, resolve)
      this.send({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown) {
    this.send({ jsonrpc: '2.0', method, params })
  }

  async initialize() {
    return this.call('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } }
    })
  }

  async newSession(): Promise<{ sessionId: string; result: Frame }> {
    const res = await this.call('session/new', { cwd: CWD, mcpServers: [] })
    return { sessionId: (res.result as { sessionId: string })?.sessionId, result: res }
  }

  updateKinds(): Record<string, number> {
    const kinds: Record<string, number> = {}
    for (const u of this.updates) {
      const k = String(u.sessionUpdate ?? 'unknown')
      kinds[k] = (kinds[k] ?? 0) + 1
    }
    return kinds
  }

  kill() {
    this.child.kill()
  }
}

function print(label: string, value: unknown, max = 1800) {
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(value, null, 2).slice(0, max))
}

const probe = new AcpProbe()
const timeout = setTimeout(
  () => {
    console.error('TIMEOUT')
    probe.kill()
    process.exit(1)
  },
  Number(process.env.PROBE_TIMEOUT ?? 600_000)
)

const init = await probe.initialize()
print('initialize', init.result)

if (mode === 'caps') {
  print('session/list', (await probe.call('session/list', {})).result, 2500)
  const { result } = await probe.newSession()
  const r = result.result as { models?: Record<string, unknown>; modes?: unknown; _meta?: unknown }
  print('models', r.models, 700)
  print('modes', r.modes)
  print('_meta', r._meta)
} else if (mode === 'stream') {
  const prompt =
    process.argv[3] ??
    "Run 'echo hello' in the shell, then write out.txt containing 'done', then summarise."
  const { sessionId } = await probe.newSession()
  const res = await probe.call('session/prompt', {
    sessionId,
    prompt: [{ type: 'text', text: prompt }]
  })
  print('update kinds', probe.updateKinds())
  console.log('\n=== tool call frames ===')
  for (const u of probe.updates) {
    if (String(u.sessionUpdate ?? '').startsWith('tool_call'))
      console.log(' ', JSON.stringify(u).slice(0, 200))
  }
  print('prompt result', res.result ?? res.error, 800)
} else if (mode === 'replay') {
  const sessionId = process.argv[3]
  if (!sessionId) {
    console.error('usage: probe-hermes-acp.ts replay <sessionId>')
    process.exit(1)
  }
  const res = await probe.call('session/load', { sessionId, cwd: CWD, mcpServers: [] })
  if (res.error) print('session/load error', res.error)
  print('replayed update kinds', probe.updateKinds())
  console.log('\n=== replayed tool calls ===')
  for (const u of probe.updates) {
    if (String(u.sessionUpdate ?? '').startsWith('tool_call'))
      console.log(' ', JSON.stringify(u).slice(0, 200))
  }
} else if (mode === 'cancel') {
  const { sessionId } = await probe.newSession()
  const started = Date.now()
  const slow = probe.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: 'Write a 3000-word essay about the history of the bicycle. Do not use tools.'
      }
    ]
  })
  await new Promise(r => setTimeout(r, 8000))
  console.log('sending session/cancel at t+8s')
  probe.notify('session/cancel', { sessionId })
  const res = await slow
  console.log(`resolved after ${((Date.now() - started) / 1000).toFixed(1)}s`)
  print('prompt result', res.result ?? res.error, 600)
} else if (mode === 'modes') {
  // A/B: deny every prompt, so an unsuppressed approval visibly blocks the write.
  const modeId = process.argv[3] ?? 'dont_ask'
  probe.permissionPolicy = 'deny'
  const { sessionId } = await probe.newSession()
  const set = await probe.call('session/set_mode', { sessionId, modeId })
  console.log(`session/set_mode(${modeId}) ->`, JSON.stringify(set.result ?? set.error))
  const res = await probe.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: "Write a file gated.txt containing 'no-prompt-needed'. Use your file write tool."
      }
    ]
  })
  console.log(
    'stopReason:',
    JSON.stringify((res.result as Record<string, unknown>)?.stopReason ?? res.error)
  )
  console.log('permission prompts fired:', probe.permissionRequests)
  console.log(`check whether ${CWD}/gated.txt exists`)
} else {
  console.error(`unknown mode: ${mode}`)
  probe.kill()
  process.exit(1)
}

clearTimeout(timeout)
probe.kill()
process.exit(0)
