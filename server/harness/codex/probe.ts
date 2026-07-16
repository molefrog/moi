// Standalone probe for the `codex app-server` JSON-RPC protocol — talk to the
// raw harness without moi in the loop. Complements /playground/codex (which
// debugs the full server → client pipeline); use this when you need to poke
// the protocol itself: try params, watch notifications, verify a claim in
// ./NOTES.md.
//
// Usage:
//   bun scripts/codex-probe.ts chat  [cwd] "prompt"   — thread/start + one turn
//   bun scripts/codex-probe.ts rpc   [cwd] <method> ['params-json']
//   bun scripts/codex-probe.ts models                 — model/list
//   bun scripts/codex-probe.ts threads [cwd]          — thread/list for cwd
//   bun scripts/codex-probe.ts read  [cwd] <threadId> — thread/read w/ turns
//
// Flags: --model=<id> --effort=<level> --summary=<auto|concise|detailed|none>
//        --timeout=<sec, default 120> --json (newline JSON, no pretty labels)
//
// Every frame in both directions is printed. Server→client requests
// (approvals) are auto-accepted and logged.

type Json = Record<string, unknown>

const flags = new Map<string, string>()
const positional: string[] = []
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  if (m) flags.set(m[1], m[2] ?? 'true')
  else positional.push(a)
}
const [cmd = 'chat', ...rest] = positional
const asJson = flags.get('json') === 'true'
const timeoutSec = Number(flags.get('timeout') ?? 120)

const bin = process.env.CODEX_CLI_PATH ?? Bun.which('codex')
if (!bin) {
  console.error('codex binary not found (install @openai/codex or set CODEX_CLI_PATH)')
  process.exit(1)
}

const cwd = rest[0] && !rest[0].startsWith('{') ? rest[0] : process.cwd()

const proc = Bun.spawn([bin, 'app-server'], {
  cwd,
  stdin: 'pipe',
  stdout: 'pipe',
  stderr: 'pipe'
})

let nextId = 1
const pending = new Map<number, (v: { result?: unknown; error?: unknown }) => void>()

function log(dir: '>>' | '<<', frame: unknown) {
  if (asJson) console.log(JSON.stringify({ dir, frame }))
  else {
    const f = frame as Json
    const head =
      typeof f.method === 'string'
        ? `${f.method}${'id' in f ? ` #${f.id}` : ''}`
        : `response #${f.id}`
    console.log(`${dir} ${head}`)
    const body = JSON.stringify(f.params ?? f.result ?? f.error ?? {}, null, 2)
    if (body !== '{}') console.log(body.replace(/^/gm, '   '))
  }
}

function send(frame: Json) {
  log('>>', frame)
  proc.stdin.write(JSON.stringify(frame) + '\n')
  proc.stdin.flush()
}

function rpc<T>(method: string, params: Json = {}): Promise<T> {
  const id = nextId++
  send({ jsonrpc: '2.0', id, method, params })
  return new Promise((resolve, reject) => {
    pending.set(id, msg => {
      if (msg.error !== undefined) reject(new Error(JSON.stringify(msg.error)))
      else resolve(msg.result as T)
    })
  })
}

let turnDone: (() => void) | null = null

async function readLoop() {
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (!line.trim()) continue
      let msg: Json
      try {
        msg = JSON.parse(line) as Json
      } catch {
        continue
      }
      log('<<', msg)
      if ('id' in msg && 'method' in msg) {
        // Server→client request: accept approvals, reject the rest.
        const method = msg.method as string
        const accepts = method.endsWith('requestApproval') || method === 'applyPatchApproval'
        send(
          accepts
            ? { jsonrpc: '2.0', id: msg.id, result: { decision: 'accept' } }
            : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'probe: unhandled' } }
        )
      } else if ('id' in msg) {
        const cb = pending.get(msg.id as number)
        pending.delete(msg.id as number)
        cb?.(msg as { result?: unknown; error?: unknown })
      } else if (msg.method === 'turn/completed') {
        turnDone?.()
      }
    }
  }
}

async function drainStderr() {
  const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value).trim()
    if (text) console.error('[stderr]', text)
  }
}

void readLoop()
void drainStderr()

setTimeout(() => {
  console.error(`probe timeout after ${timeoutSec}s`)
  proc.kill()
  process.exit(1)
}, timeoutSec * 1000)

await rpc('initialize', {
  clientInfo: { name: 'moi-codex-probe', title: 'moi codex probe', version: '0.1' },
  capabilities: { experimentalApi: false, requestAttestation: false }
})
send({ jsonrpc: '2.0', method: 'initialized', params: {} })

if (cmd === 'models') {
  await rpc('model/list', {})
} else if (cmd === 'threads') {
  await rpc('thread/list', { cwd, limit: 20 })
} else if (cmd === 'read') {
  await rpc('thread/read', { threadId: rest[1], includeTurns: true })
} else if (cmd === 'rpc') {
  const method = rest[0]?.startsWith('{') ? cmd : (rest[1] ?? rest[0])
  const paramsRaw = rest.find(a => a.startsWith('{'))
  await rpc(method, paramsRaw ? (JSON.parse(paramsRaw) as Json) : {})
} else if (cmd === 'chat') {
  const prompt = rest[rest.length - 1] ?? 'Reply with exactly: pong'
  const started = await rpc<{ thread: { id: string } }>('thread/start', {
    cwd,
    sandbox: 'danger-full-access',
    approvalPolicy: 'never',
    ...(flags.has('model') ? { model: flags.get('model') } : {})
  })
  const waitTurn = new Promise<void>(res => {
    turnDone = res
  })
  await rpc('turn/start', {
    threadId: started.thread.id,
    input: [{ type: 'text', text: prompt }],
    ...(flags.has('model') ? { model: flags.get('model') } : {}),
    ...(flags.has('effort') ? { effort: flags.get('effort') } : {}),
    ...(flags.has('summary') ? { summary: flags.get('summary') } : {})
  })
  await waitTurn
} else {
  console.error(`unknown command: ${cmd}`)
}

proc.kill()
process.exit(0)
