// Drive `hermes acp` (Agent Client Protocol over stdio JSON-RPC) directly,
// without moi in the loop — the evidence behind server/harness/hermes/NOTES.md.
//
// Usage:
//   bun scripts/probe-hermes-acp.ts caps
//   bun scripts/probe-hermes-acp.ts stream ["prompt"]
//   bun scripts/probe-hermes-acp.ts replay <sessionId>
//   bun scripts/probe-hermes-acp.ts cancel
//   bun scripts/probe-hermes-acp.ts modes [dont_ask|default]
//   bun scripts/probe-hermes-acp.ts timing          # token-streaming cadence
//   bun scripts/probe-hermes-acp.ts vision          # image content block
//   bun scripts/probe-hermes-acp.ts mcp <server.py> # session-scoped MCP server
//   bun scripts/probe-hermes-acp.ts env             # spawn env → agent shell
//   bun scripts/probe-hermes-acp.ts e2e             # full moi-shaped flow
//
// Env: HERMES_BIN (default `hermes`), PROBE_CWD (default cwd),
//      PROBE_MODEL (e.g. openai-api:gpt-5.4-mini), PROBE_PROFILE (hermes -p).

import { spawn } from 'node:child_process'

type Frame = Record<string, unknown>
type Update = { sessionUpdate?: string; content?: { text?: string } } & Record<string, unknown>

const HERMES = process.env.HERMES_BIN ?? 'hermes'
const CWD = process.env.PROBE_CWD ?? process.cwd()
const MODEL = process.env.PROBE_MODEL ?? ''
const PROFILE = process.env.PROBE_PROFILE ?? ''
const mode = process.argv[2] ?? 'caps'

// 64x64 red circle on white — small enough to inline, unmistakable to describe.
const TEST_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAABD0lEQVR42u2a2xHDIAwE8U2aof9iKAcXkJiHEHAmp+9Y2oVzJo65cs7hzYXw8pLA7vr4tksxlj8QU/KdeLncxFXueSZDAgZudxOjgAu6iwYY6Ed69u3ADPTBrQAVvWEKqOgNs8BG3zsRhPRdc8FJ3z4dtPSNDOf+GmVY/hYSkNNXeU6MENvyl6n0SMkmwJmfApsiRCXAnJ8nQkVIAhKQgAQkIAEaAfe3D+71TagIsQkwp+gnmyJEKMCZoieqQyPEtgkFHhiu4aE//VuIYROqDBi8fi99U4R2OTTOhWOv9fQdN/FKh65ZmNR3DX2wHbeZ9BeqbYGwbNKknv96YmvchOLMnMGE9NSinsgkIIFtdQP3YoFbE2n1dAAAAABJRU5ErkJggg=='

class AcpProbe {
  private child
  private nextId = 1
  private pending = new Map<number, (f: Frame) => void>()
  private buf = ''
  private t0 = Date.now()
  updates: Update[] = []
  stamped: { t: number; kind: string; text: string }[] = []
  permissionRequests = 0
  // 'allow' auto-approves; 'deny' rejects — used by the modes A/B.
  permissionPolicy: 'allow' | 'deny' = 'allow'

  constructor(extraEnv: Record<string, string> = {}) {
    const args = PROFILE ? ['-p', PROFILE, 'acp'] : ['acp']
    this.child = spawn(HERMES, args, {
      cwd: CWD,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv }
    })
    this.child.stdout.on('data', (c: Buffer) => this.onData(c))
    this.child.stderr.on('data', (c: Buffer) => {
      if (process.env.PROBE_STDERR) console.error('  [stderr]', c.toString().trim().slice(0, 240))
    })
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
        const u = ((frame.params as { update?: Update })?.update ?? {}) as Update
        this.updates.push(u)
        this.stamped.push({
          t: Date.now() - this.t0,
          kind: String(u.sessionUpdate ?? '?'),
          text: String(u.content?.text ?? '')
        })
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

  // What moi's session.ts would do on every new session: create scoped to the
  // workspace cwd, then drop into the no-prompt mode to match its trust model.
  async newSession(mcpServers: unknown[] = []): Promise<{ sessionId: string; result: Frame }> {
    const res = await this.call('session/new', { cwd: CWD, mcpServers })
    const sessionId = (res.result as { sessionId: string })?.sessionId
    if (sessionId) {
      if (MODEL) await this.call('session/set_model', { sessionId, modelId: MODEL })
      await this.call('session/set_mode', { sessionId, modeId: 'dont_ask' })
    }
    return { sessionId, result: res }
  }

  assistantText(): string {
    return this.stamped
      .filter(s => s.kind === 'agent_message_chunk')
      .map(s => s.text)
      .join('')
  }

  updateKinds(): Record<string, number> {
    const kinds: Record<string, number> = {}
    for (const u of this.updates) {
      const k = String(u.sessionUpdate ?? 'unknown')
      kinds[k] = (kinds[k] ?? 0) + 1
    }
    return kinds
  }

  reset() {
    this.updates = []
    this.stamped = []
  }

  timingReport(kind: string) {
    const rows = this.stamped.filter(s => s.kind === kind)
    if (rows.length < 2) {
      console.log(`  ${kind}: ${rows.length} frames (too few to measure)`)
      return
    }
    const gaps: number[] = []
    for (let i = 1; i < rows.length; i++) gaps.push(rows[i].t - rows[i - 1].t)
    gaps.sort((a, b) => a - b)
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
    console.log(
      `  ${kind}: ${rows.length} frames | first@${rows[0].t}ms last@${rows[rows.length - 1].t}ms | ` +
        `gap median ${gaps[Math.floor(gaps.length / 2)]}ms max ${gaps[gaps.length - 1]}ms avg ${avg.toFixed(1)}ms`
    )
  }

  kill() {
    this.child.kill()
  }
}

function print(label: string, value: unknown, max = 1800) {
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(value, null, 2).slice(0, max))
}

const extraEnv = mode === 'env' || mode === 'e2e' ? { MOI_TEST_ENV: 'moi-env-works-7391' } : {}
const probe = new AcpProbe(extraEnv)
const timeout = setTimeout(
  () => {
    console.error('TIMEOUT')
    probe.kill()
    process.exit(1)
  },
  Number(process.env.PROBE_TIMEOUT ?? 900_000)
)

const init = await probe.initialize()
if (mode === 'caps') print('initialize', init.result)

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
} else if (mode === 'timing') {
  const { sessionId } = await probe.newSession()
  const res = await probe.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: 'Think step by step about why the sky is blue, then give a 120-word explanation. No tools.'
      }
    ]
  })
  console.log('\n=== streaming cadence ===')
  probe.timingReport('agent_thought_chunk')
  probe.timingReport('agent_message_chunk')
  const order = probe.stamped
    .filter(s => s.kind.endsWith('_chunk'))
    .map(s => (s.kind.includes('thought') ? 'T' : 'M'))
  console.log(`  order (T=thought, M=message): ${order.slice(0, 40).join('')}…`)
  console.log('  stopReason:', JSON.stringify((res.result as Record<string, unknown>)?.stopReason))
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
  const res = await probe.call('session/new', { cwd: CWD, mcpServers: [] })
  const sessionId = (res.result as { sessionId: string }).sessionId
  const set = await probe.call('session/set_mode', { sessionId, modeId })
  console.log(`session/set_mode(${modeId}) ->`, JSON.stringify(set.result ?? set.error))
  const out = await probe.call('session/prompt', {
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
    JSON.stringify((out.result as Record<string, unknown>)?.stopReason ?? out.error)
  )
  console.log('permission prompts fired:', probe.permissionRequests)
  console.log(`check whether ${CWD}/gated.txt exists`)
} else if (mode === 'vision') {
  const { sessionId } = await probe.newSession()
  const res = await probe.call('session/prompt', {
    sessionId,
    prompt: [
      { type: 'text', text: 'Describe this image: name every shape you see and its colour.' },
      { type: 'image', mimeType: 'image/png', data: TEST_PNG }
    ]
  })
  console.log('\n=== vision answer (expect: red circle on white) ===')
  console.log(probe.assistantText().slice(0, 700) || '(no message chunks)')
  console.log(
    '\nstopReason:',
    JSON.stringify((res.result as Record<string, unknown>)?.stopReason ?? res.error)
  )
} else if (mode === 'mcp') {
  const server = process.argv[3]
  if (!server) {
    console.error('usage: probe-hermes-acp.ts mcp <server-script>')
    process.exit(1)
  }
  const { sessionId } = await probe.newSession([
    { name: 'mini', command: process.env.PROBE_MCP_CMD ?? 'python3', args: [server], env: [] }
  ])
  const res = await probe.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: 'Call the moi_secret_number tool and report the number. If you lack that tool, say NO_TOOL.'
      }
    ]
  })
  console.log('\n=== mcp answer ===')
  console.log(probe.assistantText().slice(0, 600) || '(none)')
  console.log(
    '\nstopReason:',
    JSON.stringify((res.result as Record<string, unknown>)?.stopReason ?? res.error)
  )
} else if (mode === 'env') {
  const { sessionId } = await probe.newSession()
  const res = await probe.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: 'Run the shell command: printenv MOI_TEST_ENV — report its exact value, or NOT_SET.'
      }
    ]
  })
  console.log('\n=== env answer (expect: moi-env-works-7391) ===')
  console.log(probe.assistantText().slice(0, 500) || '(none)')
  console.log(
    '\nstopReason:',
    JSON.stringify((res.result as Record<string, unknown>)?.stopReason ?? res.error)
  )
} else if (mode === 'e2e') {
  // The whole flow a moi harness would drive, in order, on one connection.
  const results: string[] = []
  const step = (name: string, ok: boolean, detail: string) => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(28)} ${detail}`)
    console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`)
  }

  const caps =
    (init.result as {
      agentCapabilities?: Record<string, unknown>
      agentInfo?: { version?: string }
    }) ?? {}
  step('initialize', !!caps.agentInfo?.version, `hermes-agent ${caps.agentInfo?.version}`)

  const mcpServer = process.env.PROBE_MCP_SERVER
  const { sessionId, result } = await probe.newSession(
    mcpServer
      ? [
          {
            name: 'mini',
            command: process.env.PROBE_MCP_CMD ?? 'python3',
            args: [mcpServer],
            env: []
          }
        ]
      : []
  )
  const models = (
    result.result as { models?: { availableModels?: unknown[]; currentModelId?: string } }
  )?.models
  step(
    'session/new + set_mode',
    !!sessionId,
    `${sessionId?.slice(0, 8)}… cwd=${CWD.split('/').slice(-1)[0]}`
  )
  step(
    'model catalog inline',
    (models?.availableModels?.length ?? 0) > 0,
    `${models?.availableModels?.length} models, current=${models?.currentModelId}`
  )

  // Turn 1 — tools + env, no approval prompts expected.
  probe.reset()
  const t1 = await probe.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: "Run 'printenv MOI_TEST_ENV', then write e2e.txt containing that value. Report the value."
      }
    ]
  })
  const t1text = probe.assistantText()
  step(
    'turn 1 (tools + env)',
    t1text.includes('moi-env-works-7391'),
    `env reached agent shell; prompts=${probe.permissionRequests}`
  )
  step(
    'token streaming',
    probe.stamped.filter(s => s.kind.endsWith('_chunk')).length > 10,
    `${probe.stamped.filter(s => s.kind === 'agent_thought_chunk').length} thought + ${probe.stamped.filter(s => s.kind === 'agent_message_chunk').length} message frames`
  )
  const usage = (t1.result as { usage?: Record<string, number> })?.usage
  step(
    'per-turn usage',
    !!usage?.totalTokens,
    `${usage?.inputTokens} in / ${usage?.outputTokens} out`
  )

  if (mcpServer) {
    probe.reset()
    await probe.call('session/prompt', {
      sessionId,
      prompt: [
        { type: 'text', text: 'Call moi_secret_number and report the number, or say NO_TOOL.' }
      ]
    })
    step(
      'mcp tool',
      probe.assistantText().includes('4173'),
      probe.assistantText().replace(/\s+/g, ' ').slice(0, 60)
    )
  }

  // Turn 2 — vision, on a vision-capable model if one was named.
  if (MODEL) {
    probe.reset()
    await probe.call('session/prompt', {
      sessionId,
      prompt: [
        { type: 'text', text: 'Describe this image in one sentence.' },
        { type: 'image', mimeType: 'image/png', data: TEST_PNG }
      ]
    })
    const v = probe.assistantText().toLowerCase()
    step(
      'vision',
      v.includes('circle') || v.includes('red'),
      probe.assistantText().replace(/\s+/g, ' ').slice(0, 70)
    )
  }

  // Interrupt.
  probe.reset()
  const slow = probe.call('session/prompt', {
    sessionId,
    prompt: [
      { type: 'text', text: 'Write a 3000-word essay about the history of the bicycle. No tools.' }
    ]
  })
  await new Promise(r => setTimeout(r, 6000))
  probe.notify('session/cancel', { sessionId })
  const cancelled = await slow
  const stop = (cancelled.result as { stopReason?: string })?.stopReason
  step('interrupt', stop === 'cancelled', `stopReason=${stop}`)

  // Cold resume in a second process — what moi does after idle eviction.
  probe.kill()
  const probe2 = new AcpProbe(extraEnv)
  await probe2.initialize()
  const listed = await probe2.call('session/list', { cwd: CWD })
  const found = (
    (listed.result as { sessions?: { sessionId: string; title?: string }[] })?.sessions ?? []
  ).find(s => s.sessionId === sessionId)
  step('session/list by cwd', !!found, `title="${found?.title?.slice(0, 40) ?? '—'}"`)

  const loaded = await probe2.call('session/load', { sessionId, cwd: CWD, mcpServers: [] })
  const kinds = probe2.updateKinds()
  const pairsOk = (kinds.tool_call ?? 0) > 0 && kinds.tool_call === kinds.tool_call_update
  step(
    'history replay',
    !loaded.error && (kinds.user_message_chunk ?? 0) > 0,
    JSON.stringify(kinds)
  )
  step(
    'replay tool pairing',
    pairsOk,
    `${kinds.tool_call ?? 0} starts / ${kinds.tool_call_update ?? 0} completions`
  )

  probe2.reset()
  const cont = await probe2.call('session/prompt', {
    sessionId,
    prompt: [
      {
        type: 'text',
        text: 'What value did you write into e2e.txt earlier? Answer from memory, no tools.'
      }
    ]
  })
  step(
    'context survives resume',
    probe2.assistantText().includes('moi-env-works-7391'),
    probe2.assistantText().replace(/\s+/g, ' ').slice(0, 60)
  )
  void cont

  console.log('\n=== e2e summary ===')
  for (const r of results) console.log(' ', r)
  const failed = results.filter(r => r.startsWith('FAIL')).length
  console.log(`\n${results.length - failed}/${results.length} passed`)
  probe2.kill()
  clearTimeout(timeout)
  process.exit(failed ? 1 : 0)
} else {
  console.error(`unknown mode: ${mode}`)
  probe.kill()
  process.exit(1)
}

clearTimeout(timeout)
probe.kill()
process.exit(0)
