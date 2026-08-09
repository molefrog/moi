// Long-lived ACP client, one process per workspace.
//
// ACP agents are JSON-RPC 2.0 servers over stdio (newline-delimited JSON) that
// serve every session of one workspace: sessions carry their own cwd, but env
// is process-level, so per-workspace env injection (moi's `workspaceEnv`)
// forces one process per workspace — same frozen-at-spawn semantics as the
// Codex app-server and the Claude Code subprocess.
//
// Provider-agnostic: `AcpSpawnSpec` says what to spawn, everything else here
// is protocol. See ./wire.ts for the message shapes.
import type { AcpInitializeResult, AcpRequestPermissionParams } from './wire'

import { debug } from '../../debug'
import { tapWire } from '../debug'
import { resolveWorkspaceEnv } from '../../workspace-env'

const REQUEST_TIMEOUT_MS = 120_000

type Json = Record<string, unknown>
type NotificationListener = (method: string, params: Json) => void

export type AcpSpawnSpec = {
  // Provider id, used for log prefixes and the wire tap scope.
  provider: string
  // Absolute path to the agent binary (already resolved through PATH).
  command: string
  args: readonly string[]
  workspacePath: string
  // Extra env layered over process env + the workspace env.
  env?: Record<string, string>
}

export type AcpClient = {
  rpc: <T>(method: string, params?: Json) => Promise<T>
  notify: (method: string, params?: Json) => void
  onNotification: (l: NotificationListener) => () => void
  isAlive: () => boolean
  workspacePath: string
  initializeResult: AcpInitializeResult
}

export type AcpProcessInfo = {
  running: boolean
  pid?: number
  binary: string | null
  agent?: string
}

type ClientRecord = {
  client: AcpClient
  proc: ReturnType<typeof Bun.spawn>
}

const clients = new Map<string, Promise<ClientRecord>>() // key: workspacePath

// Client capabilities moi actually honours. We do NOT advertise fs access:
// ACP agents that can't read files themselves would delegate to us, and moi's
// agents run with full workspace access already. Terminal is likewise the
// agent's own business.
const CLIENT_CAPABILITIES = { fs: { readTextFile: false, writeTextFile: false } }

async function startClient(spec: AcpSpawnSpec): Promise<ClientRecord> {
  const { provider, command, args, workspacePath } = spec
  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const proc = Bun.spawn([command, ...args], {
    cwd: workspacePath,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    // MOI_AGENT marks the agent's shells as agent-driven for the moi CLI
    // (see agent-caller.ts).
    env: { ...process.env, ...workspaceEnv, ...spec.env, MOI_AGENT: '1' }
  })

  let alive = true
  let nextId = 1
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: Timer }
  >()
  const listeners = new Set<NotificationListener>()

  function send(obj: Json) {
    tapWire(workspacePath, 'send', obj)
    proc.stdin.write(JSON.stringify(obj) + '\n')
    proc.stdin.flush()
  }

  function rpc<T>(method: string, params: Json = {}): Promise<T> {
    if (!alive) return Promise.reject(new Error(`${provider} agent not running`))
    const id = nextId++
    send({ jsonrpc: '2.0', id, method, params })
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${provider} rpc timeout: ${method}`))
      }, REQUEST_TIMEOUT_MS)
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
    })
  }

  function fanout(method: string, params: Json) {
    for (const l of listeners) {
      try {
        l(method, params)
      } catch (err) {
        console.error(`[${provider}] notification listener threw`, err)
      }
    }
  }

  // Server→client requests MUST be answered or the turn hangs. Sessions run in
  // the backend's no-prompt mode (see session.ts), so permission requests
  // should not occur — approve defensively if one does, matching moi's
  // bypass-permissions trust model. Everything else is refused as unsupported.
  function answerServerRequest(msg: Json) {
    const method = msg.method as string
    if (method === 'session/request_permission') {
      const params = (msg.params ?? {}) as AcpRequestPermissionParams
      const options = params.options ?? []
      const allow = options.find(o => o.kind?.startsWith('allow')) ?? options[0]
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: allow
          ? { outcome: { outcome: 'selected', optionId: allow.optionId } }
          : { outcome: { outcome: 'cancelled' } }
      })
      return
    }
    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `moi does not handle ${method}` }
    })
  }

  function handleLine(line: string) {
    if (!line.trim()) return
    let msg: Json
    try {
      msg = JSON.parse(line) as Json
    } catch {
      // ACP reserves stdout for JSON-RPC, but a misbehaving agent can still
      // print — drop the line rather than killing the connection.
      return
    }
    tapWire(workspacePath, 'recv', msg)
    if ('id' in msg && 'method' in msg) {
      answerServerRequest(msg)
    } else if ('id' in msg) {
      const p = pending.get(msg.id as number)
      if (!p) return
      pending.delete(msg.id as number)
      clearTimeout(p.timer)
      if ('error' in msg) {
        const e = msg.error as { message?: string } | undefined
        p.reject(new Error(e?.message ?? JSON.stringify(msg.error)))
      } else {
        p.resolve(msg.result)
      }
    } else if (typeof msg.method === 'string') {
      fanout(msg.method, (msg.params ?? {}) as Json)
    }
  }

  async function readLoop() {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    let buf = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          handleLine(buf.slice(0, nl))
          buf = buf.slice(nl + 1)
        }
      }
    } finally {
      alive = false
      if (clients.get(workspacePath) === recordPromise) clients.delete(workspacePath)
      for (const [, p] of pending) {
        clearTimeout(p.timer)
        p.reject(new Error(`${provider} agent exited`))
      }
      pending.clear()
      fanout('__exit', {})
      debug(`${provider} acp exited ws=${workspacePath}`)
    }
  }

  async function drainStderr() {
    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value).trim()
      // ACP agents log operational INFO/WARNING to stderr by design; only
      // surface it under debug so a normal run stays quiet.
      if (text) debug(`[${provider} stderr] ${text}`)
    }
  }

  const client: AcpClient = {
    rpc,
    notify: (method, params = {}) => send({ jsonrpc: '2.0', method, params }),
    onNotification(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    isAlive: () => alive,
    workspacePath,
    initializeResult: {}
  }
  const record: ClientRecord = { client, proc }
  const recordPromise = Promise.resolve(record)

  void readLoop()
  void drainStderr()

  client.initializeResult = await rpc<AcpInitializeResult>('initialize', {
    protocolVersion: 1,
    clientCapabilities: CLIENT_CAPABILITIES
  })
  const info = client.initializeResult.agentInfo
  debug(
    `${provider} acp started ws=${workspacePath} bin=${command} agent=${info?.name ?? '?'}/${info?.version ?? '?'}`
  )
  return record
}

export async function getAcpClient(spec: AcpSpawnSpec): Promise<AcpClient> {
  const existing = clients.get(spec.workspacePath)
  if (existing) {
    const rec = await existing
    if (rec.client.isAlive()) return rec.client
    clients.delete(spec.workspacePath)
  }
  const started = startClient(spec)
  clients.set(spec.workspacePath, started)
  try {
    return (await started).client
  } catch (err) {
    clients.delete(spec.workspacePath)
    throw err
  }
}

// Preview reads must not spawn an agent — home-page cards render for every
// workspace, and ACP agents are slow to start (Hermes takes seconds). Returns
// the workspace's client only if one is already running.
export async function peekAcpClient(workspacePath: string): Promise<AcpClient | null> {
  const existing = clients.get(workspacePath)
  if (!existing) return null
  try {
    const rec = await existing
    return rec.client.isAlive() ? rec.client : null
  } catch {
    return null
  }
}

export async function getAcpProcessInfo(
  workspacePath: string,
  binary: string | null
): Promise<AcpProcessInfo> {
  const rec = clients.get(workspacePath)
  if (!rec) return { running: false, binary }
  try {
    const r = await rec
    const info = r.client.initializeResult.agentInfo
    return {
      running: r.client.isAlive(),
      pid: r.proc.pid,
      binary,
      agent: info ? `${info.name ?? '?'}/${info.version ?? '?'}` : undefined
    }
  } catch {
    return { running: false, binary }
  }
}

// Kill a workspace's agent so the next message respawns it with fresh env (env
// is process-level and frozen at spawn). In-flight turns are lost.
export function killAcpWorkspace(workspacePath: string): void {
  const rec = clients.get(workspacePath)
  if (!rec) return
  clients.delete(workspacePath)
  void rec.then(r => r.proc.kill()).catch(() => {})
}

// Server shutdown: kill every agent so nothing is orphaned.
export function killAllAcpClients(): void {
  for (const [path, rec] of clients) {
    clients.delete(path)
    void rec.then(r => r.proc.kill()).catch(() => {})
  }
}
