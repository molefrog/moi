// Shared, long-lived OpenClaw gateway client + event multiplexer.
//
// Discovery (`server/openclaw.ts`) opens-and-closes a one-shot client per RPC.
// Streaming needs a single persistent connection so we can subscribe and keep
// receiving server-pushed `event` frames (`session.message`, `sessions.changed`,
// `agent`, `chat`). This module owns that connection.
//
// Surface:
//   - getGateway()      → lazy connect, return { rpc, on, off }
//   - onEvent type      → matches `EventFrame` from the SDK, but read defensively
//   - reattach          → on reconnect we re-issue every `sessions.subscribe()`
//                         and `sessions.messages.subscribe({ key })` we held.
//
// Failure mode: if config or the gateway is unreachable, `getGateway()` rejects
// — callers (chat send, reattach) surface that as an error frame to the client.
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

type Rpc = <T>(method: string, params?: Record<string, unknown>) => Promise<T>
type Listener = (event: string, payload: Record<string, unknown>) => void

type ClientCtor = typeof import('openclaw/plugin-sdk/gateway-runtime').GatewayClient
type GatewayInstance = InstanceType<ClientCtor>

const CONNECT_TIMEOUT_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

let pending: Promise<GatewayHandle> | null = null
let current: { handle: GatewayHandle; client: GatewayInstance } | null = null

const listeners = new Set<Listener>()
const sessionSubscriptions = new Set<string>() // sessionKeys we hold open
let topLevelSubscribed = false

// Side-effect hook: callers (the live session module) register a one-time
// callback that fires after the gateway has reconnected and re-issued every
// previously-held subscription. Used to run a transcript reconcile so any
// durable rows committed during the disconnect are merged.
type ReconnectCallback = () => Promise<void> | void
const reconnectCallbacks = new Set<ReconnectCallback>()
export function onGatewayReconnected(cb: ReconnectCallback): () => void {
  reconnectCallbacks.add(cb)
  return () => reconnectCallbacks.delete(cb)
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let droppedSessionKeys: string[] = []
const RECONNECT_DELAY_MS = 1500

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    if (current) return // someone else already reconnected via getGateway()
    try {
      const gw = await getGateway()
      // Replay any keys that were held before the drop.
      const keys = droppedSessionKeys
      droppedSessionKeys = []
      for (const key of keys) {
        await gw.ensureSessionSubscribed(key).catch(() => {})
      }
      // Notify session-level holders so they can run a transcript reconcile.
      for (const cb of reconnectCallbacks) {
        try {
          await cb()
        } catch (err) {
          console.error('[openclaw-gateway] reconnect callback threw', err)
        }
      }
    } catch {
      // Connect still failing — schedule another attempt.
      droppedSessionKeys = droppedSessionKeys.length ? droppedSessionKeys : []
      scheduleReconnect()
    }
  }, RECONNECT_DELAY_MS)
}

export type GatewayHandle = {
  rpc: Rpc
  on: (l: Listener) => () => void
  ensureSessionSubscribed: (sessionKey: string) => Promise<void>
  ensureTopLevelSubscribed: () => Promise<void>
  isConnected: () => boolean
}

async function readGatewayConfig(): Promise<{ port: number; token: string } | null> {
  try {
    const raw = await readFile(join(homedir(), '.openclaw/openclaw.json'), 'utf8')
    const cfg = JSON.parse(raw) as {
      gateway?: { port?: number; auth?: { token?: string } }
    }
    const port = cfg.gateway?.port
    const token = cfg.gateway?.auth?.token
    if (typeof port !== 'number' || typeof token !== 'string') return null
    return { port, token }
  } catch {
    return null
  }
}

function fanout(event: string, payload: Record<string, unknown>) {
  for (const l of listeners) {
    try {
      l(event, payload)
    } catch (err) {
      console.error('[openclaw-gateway] listener threw', err)
    }
  }
}

async function startClient(): Promise<{ handle: GatewayHandle; client: GatewayInstance }> {
  const cfg = await readGatewayConfig()
  if (!cfg) throw new Error('openclaw config missing or invalid')
  const { GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime')

  let connected = false
  const client = new GatewayClient({
    url: `ws://127.0.0.1:${cfg.port}`,
    token: cfg.token,
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    onEvent: evt => {
      const event = (evt as unknown as { event?: unknown }).event
      const payload = (evt as unknown as { payload?: unknown }).payload
      if (typeof event !== 'string') return
      fanout(
        event,
        (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      )
    },
    onClose: () => {
      connected = false
      current = null
      pending = null
      // Mark every held subscription as needing re-issue after the next
      // connect. The Set entries themselves stay so we know what to re-issue.
      topLevelSubscribed = false
      const dropped = [...sessionSubscriptions]
      sessionSubscriptions.clear()
      droppedSessionKeys = dropped
      scheduleReconnect()
    }
  })

  await new Promise<void>((res, rej) => {
    const t = setTimeout(
      () => rej(new Error(`openclaw connect timeout after ${CONNECT_TIMEOUT_MS}ms`)),
      CONNECT_TIMEOUT_MS
    )
    client.opts.onHelloOk = () => {
      clearTimeout(t)
      connected = true
      res()
    }
    client.opts.onConnectError = err => {
      clearTimeout(t)
      rej(err)
    }
    client.start()
  })

  const rpc: Rpc = (method, params = {}) => client.request(method, params) as Promise<never>

  const handle: GatewayHandle = {
    rpc,
    on(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async ensureSessionSubscribed(sessionKey: string) {
      if (sessionSubscriptions.has(sessionKey)) return
      sessionSubscriptions.add(sessionKey)
      try {
        await rpc('sessions.messages.subscribe', { key: sessionKey })
      } catch (err) {
        sessionSubscriptions.delete(sessionKey)
        throw err
      }
    },
    async ensureTopLevelSubscribed() {
      if (topLevelSubscribed) return
      topLevelSubscribed = true
      try {
        await rpc('sessions.subscribe', {})
      } catch (err) {
        topLevelSubscribed = false
        throw err
      }
    },
    isConnected: () => connected
  }

  // On reconnect (if `GatewayClient` reconnects automatically) re-issue all
  // subscriptions. The SDK does have backoff reconnect; if it fires onClose we
  // tear down `current` so the next getGateway() rebuilds and re-subscribes.
  return { handle, client }
}

export async function getGateway(): Promise<GatewayHandle> {
  if (current) return current.handle
  if (pending) return pending
  pending = (async () => {
    try {
      const built = await startClient()
      current = built
      // Always re-issue the top-level subscription so `sessions.changed`
      // events resume; per-session keys are replayed by `scheduleReconnect`
      // (or by the next caller of ensureSessionSubscribed).
      await built.handle.ensureTopLevelSubscribed().catch(() => {})
      return built.handle
    } catch (err) {
      pending = null
      throw err
    }
  })()
  return pending
}

// Low-level escape hatch for the discovery path; keep a one-shot client
// available alongside the persistent one so we don't change discovery's
// failure mode (silent, fast).
export async function withOneShotGateway<T>(fn: (rpc: Rpc) => Promise<T>): Promise<T | null> {
  const cfg = await readGatewayConfig()
  if (!cfg) return null
  const { GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime')
  const client = new GatewayClient({
    url: `ws://127.0.0.1:${cfg.port}`,
    token: cfg.token,
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    requestTimeoutMs: 2000
  })
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('openclaw connect timeout')), 2000)
      client.opts.onHelloOk = () => {
        clearTimeout(t)
        res()
      }
      client.opts.onConnectError = e => {
        clearTimeout(t)
        rej(e)
      }
      client.start()
    })
    return await fn((m, p = {}) => client.request(m, p) as Promise<never>)
  } catch {
    return null
  } finally {
    client.stop()
  }
}
