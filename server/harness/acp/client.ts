// Long-lived ACP clients, shared by spawn configuration and optional scope.
//
// ACP agents are JSON-RPC 2.0 servers over stdio (newline-delimited JSON) that
// may serve several sessions. Env is process-level and frozen at spawn. Agents
// with only one active session use a dedicated scope per chat or discovery run.
//
// Provider-agnostic: `AcpSpawnSpec` says what to spawn, everything else here
// is protocol. See ./wire.ts for the message shapes.
import type { InitializeResponse } from './wire'

import { debug } from '../../debug'
import { tapWire } from '../debug'
import { resolveWorkspaceEnv } from '../../workspace-env'

const REQUEST_TIMEOUT_MS = 120_000

// `session/prompt` stays pending for the whole agent turn by design — a turn
// can legitimately run for many minutes. Timing it out would reject the call
// while the backend keeps going, then let the next send start a second turn
// against the same session (overlapping runs, corrupted transcript). A dead
// agent still settles these: readLoop rejects everything pending on exit, and
// `session/cancel` resolves the turn with stopReason `cancelled`.
const UNBOUNDED_METHODS = new Set(['session/prompt'])

// null = never time this call out.
export function rpcTimeoutMs(method: string): number | null {
  return UNBOUNDED_METHODS.has(method) ? null : REQUEST_TIMEOUT_MS
}

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
  // Omit to share a workspace process. Session/discovery owners use distinct ids.
  scope?: string
}

export class AcpRpcError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(message: string, code: number, data?: unknown) {
    super(message)
    this.name = 'AcpRpcError'
    this.code = code
    this.data = data
  }
}

export type AcpClient = {
  rpc: <T>(method: string, params?: Json) => Promise<T>
  notify: (method: string, params?: Json) => void
  onNotification: (l: NotificationListener) => () => void
  isAlive: () => boolean
  workspacePath: string
  // Null until the initialize handshake resolves.
  initializeResult: InitializeResponse | null
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
  stop: () => void
}

type PoolEntry = {
  key: string
  spec: AcpSpawnSpec
  promise?: Promise<ClientRecord>
  record?: ClientRecord
  cancelled: boolean
}

const clients = new Map<string, PoolEntry>()
const records = new WeakMap<AcpClient, ClientRecord>()

function poolKey(spec: AcpSpawnSpec): string {
  return JSON.stringify([
    spec.provider,
    spec.workspacePath,
    spec.command,
    spec.args,
    Object.entries(spec.env ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    spec.scope ?? null
  ])
}

function isJson(value: unknown): value is Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Client capabilities moi actually honours. We do NOT advertise fs access:
// ACP agents that can't read files themselves would delegate to us, and moi's
// agents run with full workspace access already. Terminal is likewise the
// agent's own business.
const CLIENT_CAPABILITIES = { fs: { readTextFile: false, writeTextFile: false } }

async function startClient(spec: AcpSpawnSpec, entry: PoolEntry): Promise<ClientRecord> {
  const { provider, command, args, workspacePath } = spec
  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  if (entry.cancelled) throw new Error(`${provider} agent startup cancelled`)
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
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: Timer | null }
  >()
  const listeners = new Set<NotificationListener>()
  let killTimer: Timer | null = null

  // Close the transport immediately, including callers waiting on initialize.
  // A provider that ignores SIGTERM still cannot outlive its released lease.
  function finish(error: Error) {
    if (!alive) return
    alive = false
    if (clients.get(entry.key) === entry) clients.delete(entry.key)
    for (const p of pending.values()) {
      if (p.timer) clearTimeout(p.timer)
      p.reject(error)
    }
    pending.clear()
    try {
      proc.kill()
      killTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch {}
      }, 1_000)
      killTimer.unref()
    } catch {}
    fanout('__exit', {})
    debug(`${provider} acp exited ws=${workspacePath}`)
  }

  function transportError(error: unknown) {
    finish(
      new Error(
        `${provider} ACP transport failed: ${error instanceof Error ? error.message : String(error)}`
      )
    )
  }

  function send(obj: Json) {
    if (!alive) return
    try {
      tapWire(workspacePath, 'send', obj)
      proc.stdin.write(JSON.stringify(obj) + '\n')
      void Promise.resolve(proc.stdin.flush()).catch(transportError)
    } catch (error) {
      transportError(error)
    }
  }

  function rpc<T>(method: string, params: Json = {}): Promise<T> {
    if (!alive) return Promise.reject(new Error(`${provider} agent not running`))
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = rpcTimeoutMs(method)
      const timer =
        timeoutMs === null
          ? null
          : setTimeout(() => {
              pending.delete(id)
              reject(new Error(`${provider} rpc timeout: ${method}`))
            }, timeoutMs)
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      // Register first: both a synchronous write failure and a fast response
      // must find the request and settle it.
      send({ jsonrpc: '2.0', id, method, params })
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
      const params = isJson(msg.params) ? msg.params : {}
      const options = Array.isArray(params.options) ? params.options.filter(isJson) : []
      const allow = options.find(o => typeof o.kind === 'string' && o.kind.startsWith('allow'))
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result:
          allow && typeof allow.optionId === 'string'
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
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      // ACP reserves stdout for JSON-RPC, but a misbehaving agent can still
      // print — drop the line rather than killing the connection.
      return
    }
    // stdout can contain valid JSON that is not a JSON-RPC object (including
    // null); never let it tear down the reader or reach application listeners.
    if (!isJson(parsed) || parsed.jsonrpc !== '2.0') return
    const msg = parsed
    tapWire(workspacePath, 'recv', msg)
    if ('id' in msg && typeof msg.method === 'string') {
      answerServerRequest(msg)
    } else if (typeof msg.id === 'number' && ('result' in msg || 'error' in msg)) {
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (p.timer) clearTimeout(p.timer)
      if ('error' in msg) {
        const e = isJson(msg.error) ? msg.error : {}
        const message = typeof e.message === 'string' ? e.message : JSON.stringify(msg.error)
        p.reject(
          typeof e.code === 'number' ? new AcpRpcError(message, e.code, e.data) : new Error(message)
        )
      } else {
        p.resolve(msg.result)
      }
    } else if (typeof msg.method === 'string') {
      if (msg.params === undefined || msg.params === null || isJson(msg.params)) {
        fanout(msg.method, msg.params ?? {})
      }
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
      buf += decoder.decode()
      if (buf) handleLine(buf)
    } catch (error) {
      transportError(error)
    } finally {
      reader.releaseLock()
      finish(new Error(`${provider} agent exited`))
    }
  }

  async function drainStderr() {
    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true }).trim()
        // ACP agents log operational INFO/WARNING to stderr by design; only
        // surface it under debug so a normal run stays quiet.
        if (text) debug(`[${provider} stderr] ${text}`)
      }
    } catch (error) {
      transportError(error)
    } finally {
      reader.releaseLock()
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
    initializeResult: null
  }
  const record: ClientRecord = {
    client,
    proc,
    stop: () => finish(new Error(`${provider} agent released`))
  }
  entry.record = record
  records.set(client, record)

  void readLoop().catch(transportError)
  void drainStderr().catch(transportError)
  void proc.exited.then(() => {
    finish(new Error(`${provider} agent exited`))
    if (killTimer) clearTimeout(killTimer)
  }, transportError)

  // A failed handshake leaves a live subprocess behind unless we kill it: the
  // caller only drops the registry entry, so the next request would spawn a
  // second agent while this one keeps running.
  try {
    client.initializeResult = await rpc<InitializeResponse>('initialize', {
      protocolVersion: 1,
      clientCapabilities: CLIENT_CAPABILITIES
    })
  } catch (err) {
    record.stop()
    throw err
  }
  const info = client.initializeResult?.agentInfo
  debug(
    `${provider} acp started ws=${workspacePath} bin=${command} agent=${info?.name ?? '?'}/${info?.version ?? '?'}`
  )
  return record
}

export async function getAcpClient(spec: AcpSpawnSpec): Promise<AcpClient> {
  const key = poolKey(spec)
  const existing = clients.get(key)
  if (existing?.promise) {
    const rec = await existing.promise
    if (rec.client.isAlive()) return rec.client
    // An exit/release may have replaced this entry while initialize settled.
    if (clients.get(key) !== existing) return getAcpClient(spec)
    clients.delete(key)
  }
  const entry: PoolEntry = { key, spec, cancelled: false }
  clients.set(key, entry)
  const started = startClient(spec, entry)
  entry.promise = started
  try {
    const rec = await started
    if (!rec.client.isAlive()) throw new Error(`${spec.provider} agent exited during startup`)
    return rec.client
  } catch (err) {
    if (clients.get(key) === entry) clients.delete(key)
    throw err
  }
}

// Release the exact process owned by a session or short-lived discovery run.
// A stale client cannot stop a newer process with the same spawn spec.
export function releaseAcpClient(client: AcpClient): void {
  records.get(client)?.stop()
}

async function findRecord(workspacePath: string, provider?: string): Promise<ClientRecord | null> {
  const candidates = [...clients.values()].filter(
    entry =>
      entry.spec.workspacePath === workspacePath && (!provider || entry.spec.provider === provider)
  )
  for (const entry of candidates) {
    if (entry.record?.client.isAlive() && entry.record.client.initializeResult) return entry.record
  }
  for (const entry of candidates) {
    try {
      const rec = await entry.promise
      if (rec?.client.isAlive()) return rec
    } catch {}
  }
  return null
}

// Preview reads must not spawn an agent — home-page cards render for every
// workspace, and ACP agents are slow to start (Hermes takes seconds). Returns
// the workspace's client only if one is already running.
export async function peekAcpClient(
  workspacePath: string,
  provider?: string
): Promise<AcpClient | null> {
  return (await findRecord(workspacePath, provider))?.client ?? null
}

export async function getAcpProcessInfo(
  workspacePath: string,
  binary: string | null,
  provider?: string
): Promise<AcpProcessInfo> {
  const rec = await findRecord(workspacePath, provider)
  if (!rec) return { running: false, binary }
  const info = rec.client.initializeResult?.agentInfo
  return {
    running: rec.client.isAlive(),
    pid: rec.proc.pid,
    binary,
    agent: info ? `${info.name ?? '?'}/${info.version ?? '?'}` : undefined
  }
}

function stopEntry(entry: PoolEntry) {
  if (clients.get(entry.key) === entry) clients.delete(entry.key)
  entry.cancelled = true
  entry.record?.stop()
}

// Kill a workspace's agent so the next message respawns it with fresh env (env
// is process-level and frozen at spawn). In-flight turns are lost.
export function killAcpWorkspace(workspacePath: string, provider?: string): void {
  for (const entry of clients.values()) {
    if (
      entry.spec.workspacePath === workspacePath &&
      (!provider || entry.spec.provider === provider)
    ) {
      stopEntry(entry)
    }
  }
}

// Server shutdown: kill every agent so nothing is orphaned.
export function killAllAcpClients(provider?: string): void {
  for (const entry of clients.values()) {
    if (!provider || entry.spec.provider === provider) stopEntry(entry)
  }
}
