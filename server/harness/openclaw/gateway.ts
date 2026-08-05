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

import { type GatewayFailure, type GatewayInfo, classifyGatewayError, parseHelloOk } from './compat'
import { tapWire } from '../debug'

type Rpc = <T>(method: string, params?: Record<string, unknown>) => Promise<T>
type Listener = (event: string, payload: Record<string, unknown>) => void

// All openclaw wire frames are tapped under one scope: the gateway connection
// is process-global, not per-workspace (index.ts `wireScope` returns this).
export const OPENCLAW_WIRE_SCOPE = 'openclaw'

// Last connect outcome, for /status lines and user-facing errors — a
// protocol-3 gateway (≤ 2026.5.x) must surface "too old", never silent
// empty lists. Cleared on the next successful hello.
let lastFailure: GatewayFailure | null = null
let lastInfo: GatewayInfo | null = null

export function getOpenClawGatewayStatus(): {
  connected: boolean
  info: GatewayInfo | null
  failure: GatewayFailure | null
} {
  return { connected: current !== null, info: lastInfo, failure: lastFailure }
}

type ClientCtor = typeof import('openclaw/plugin-sdk/gateway-runtime').GatewayClient
type GatewayInstance = InstanceType<ClientCtor>

const CONNECT_TIMEOUT_MS = 5_000
const REQUEST_TIMEOUT_MS = 30_000

// Capabilities moi advertises to the gateway on connect. OpenClaw registers a
// connection as a live tool-event recipient only when it advertises the
// `tool-events` capability; the SDK sends `caps: []` by default, so without
// this the `session.tool` frames that drive our live tool cards
// (session.ts `handleToolFrame`) never reach our socket. BOTH the persistent
// streaming client and the one-shot discovery client must advertise it.
export const OPENCLAW_CLIENT_CAPS = ['tool-events'] as const

// The connect options shared by the persistent streaming client and the
// one-shot discovery client: identity (role/scopes), the advertised caps, and
// the pinned wire-protocol window. moi speaks protocol 4 (compat.ts); the SDK
// already defaults minProtocol/maxProtocol to 4, so pinning them is
// self-documenting rather than a behavior change. Each caller layers its own
// timeouts and event callbacks on top. Exported as a pure builder so the caps
// contract is unit-testable without opening a socket.
export function gatewayClientBaseOptions(
  url: string,
  token: string
): Pick<
  ConstructorParameters<ClientCtor>[0],
  'url' | 'token' | 'role' | 'scopes' | 'caps' | 'minProtocol' | 'maxProtocol'
> {
  return {
    url,
    token,
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    caps: [...OPENCLAW_CLIENT_CAPS],
    minProtocol: 4,
    maxProtocol: 4
  }
}

let pending: Promise<GatewayHandle> | null = null
let current: { handle: GatewayHandle; client: GatewayInstance } | null = null

const listeners = new Set<Listener>()
// Wire state: sessionKeys with a live `sessions.messages.subscribe` on the
// CURRENT socket. Cleared on disconnect, re-issued on reconnect. Separate from
// demand (refcounts) so a reconnect can re-subscribe without disturbing counts.
const sessionSubscriptions = new Set<string>()
// Demand: how many live session records depend on each key. Survives
// disconnects (the records are still alive), so it is the source of truth for
// what to re-subscribe on reconnect and when it is safe to unsubscribe. We
// subscribe on the wire on the 0→1 transition and unsubscribe on the 1→0 one.
const sessionSubscriptionRefcounts = new Map<string, number>()
let topLevelSubscribed = false

// Refcount bookkeeping split out (and exported) so the demand logic is
// unit-testable without opening a socket; the handle methods below wrap these
// with the actual subscribe/unsubscribe wire calls.

// Record a new holder for a key. Returns true when this is the FIRST holder —
// the caller should then issue the wire `sessions.messages.subscribe`.
export function acquireSessionSubscriptionRef(sessionKey: string): boolean {
  const next = (sessionSubscriptionRefcounts.get(sessionKey) ?? 0) + 1
  sessionSubscriptionRefcounts.set(sessionKey, next)
  return next === 1
}

// Drop a holder for a key. Returns true when that was the LAST holder — the
// caller should then `sessions.messages.unsubscribe`; the key is also dropped
// from the wire set so a reconnect won't replay it. Releasing an unheld key
// returns false (idempotent), so a double teardown is safe.
export function releaseSessionSubscriptionRef(sessionKey: string): boolean {
  const cur = sessionSubscriptionRefcounts.get(sessionKey)
  if (!cur) return false
  if (cur > 1) {
    sessionSubscriptionRefcounts.set(sessionKey, cur - 1)
    return false
  }
  sessionSubscriptionRefcounts.delete(sessionKey)
  sessionSubscriptions.delete(sessionKey)
  return true
}

// Current holder count for a key (0 when none). Exported for tests.
export function sessionSubscriptionRefcount(sessionKey: string): number {
  return sessionSubscriptionRefcounts.get(sessionKey) ?? 0
}

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
const RECONNECT_DELAY_MS = 1500

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    if (current) return // someone else already reconnected via getGateway()
    try {
      const gw = await getGateway()
      // Re-subscribe every key that still has a live holder (demand survived
      // the disconnect; the wire set was cleared). Wire-only re-issue — leaves
      // the refcounts untouched, and a key released during the disconnect
      // (refcount 0) is simply not replayed.
      for (const key of sessionSubscriptionRefcounts.keys()) {
        await gw.resubscribeSessionKey(key).catch(() => {})
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
      scheduleReconnect()
    }
  }, RECONNECT_DELAY_MS)
}

export type GatewayHandle = {
  rpc: Rpc
  // hello-ok metadata of the live connection (protocol, server version,
  // advertised methods/events); null before the first successful hello.
  info: () => GatewayInfo | null
  on: (l: Listener) => () => void
  // Acquire a live-holder reference on a session key: subscribes on the wire on
  // the first holder (refcount 0→1), then increments. Idempotent per holder.
  ensureSessionSubscribed: (sessionKey: string) => Promise<void>
  // Release a live-holder reference: decrements; on the last holder (1→0) it
  // best-effort `sessions.messages.unsubscribe`s and drops the key from the
  // wire set so a reconnect won't replay it. Never unsubscribes while other
  // holders remain.
  releaseSessionSubscription: (sessionKey: string) => Promise<void>
  // Wire-only re-subscribe, used by the reconnect replay to re-issue a key
  // whose demand outlived the dropped socket. Does not touch refcounts.
  resubscribeSessionKey: (sessionKey: string) => Promise<void>
  ensureTopLevelSubscribed: () => Promise<void>
  isConnected: () => boolean
}

// The live handle if the gateway is currently connected, else null. Non-
// connecting (unlike getGateway) so callers on a teardown path — session idle
// eviction, shutdown, tests without a gateway — can release a subscription
// without forcing a connect or awaiting a reconnect.
export function currentGatewayHandle(): GatewayHandle | null {
  return current?.handle ?? null
}

// Config resolution mirrors the OpenClaw CLI: explicit OPENCLAW_CONFIG_PATH
// wins, then OPENCLAW_STATE_DIR (profile runs), then the default state root.
export function openClawConfigPath(): string {
  const explicit = process.env.OPENCLAW_CONFIG_PATH
  if (explicit) return explicit
  const stateDir = process.env.OPENCLAW_STATE_DIR
  if (stateDir) return join(stateDir, 'openclaw.json')
  return join(homedir(), '.openclaw/openclaw.json')
}

export async function readGatewayConfig(): Promise<{ port: number; token: string } | null> {
  try {
    const raw = await readFile(openClawConfigPath(), 'utf8')
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
  let GatewayClient: typeof import('openclaw/plugin-sdk/gateway-runtime').GatewayClient
  try {
    ;({ GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime'))
  } catch {
    // Optional dependency absent — callers surface the rejection as a chat
    // error; keep the category visible in /status.
    const err = new Error('openclaw package is not installed')
    lastFailure = { kind: 'unreachable', message: err.message }
    throw err
  }

  let connected = false
  // The SDK's `opts` is private since 2026.7.x — connect callbacks must be
  // handed to the constructor, so wire them to a deferred promise up front.
  let settleConnect!: { res: () => void; rej: (err: Error) => void }
  const connectPromise = new Promise<void>((res, rej) => {
    settleConnect = { res, rej }
  })
  const client = new GatewayClient({
    ...gatewayClientBaseOptions(`ws://127.0.0.1:${cfg.port}`, cfg.token),
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    onHelloOk: (hello: unknown) => {
      connected = true
      lastInfo = parseHelloOk(hello)
      lastFailure = null
      settleConnect.res()
    },
    onConnectError: err => {
      lastFailure = classifyGatewayError(err)
      settleConnect.rej(err)
    },
    onEvent: evt => {
      const event = (evt as unknown as { event?: unknown }).event
      const payload = (evt as unknown as { payload?: unknown }).payload
      if (typeof event !== 'string') return
      tapWire(OPENCLAW_WIRE_SCOPE, 'recv', evt)
      fanout(
        event,
        (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
      )
    },
    onClose: () => {
      connected = false
      current = null
      pending = null
      // The socket is gone: clear the wire state (top-level + per-session
      // subscriptions). Demand (refcounts) is untouched — the reconnect replay
      // re-subscribes every key that still has a live holder.
      topLevelSubscribed = false
      sessionSubscriptions.clear()
      scheduleReconnect()
    }
  })

  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => {
      const err = new Error(`openclaw connect timeout after ${CONNECT_TIMEOUT_MS}ms`)
      lastFailure = classifyGatewayError(err)
      rej(err)
    }, CONNECT_TIMEOUT_MS)
    connectPromise.then(
      () => {
        clearTimeout(t)
        res()
      },
      err => {
        clearTimeout(t)
        rej(err)
      }
    )
    client.start()
  })

  const rpc: Rpc = (method, params = {}) => {
    tapWire(OPENCLAW_WIRE_SCOPE, 'send', { method, params })
    const p = client.request(method, params) as Promise<never>
    p.then(
      result => tapWire(OPENCLAW_WIRE_SCOPE, 'recv', { method, result }),
      (err: unknown) =>
        tapWire(OPENCLAW_WIRE_SCOPE, 'recv', {
          method,
          error: err instanceof Error ? err.message : String(err)
        })
    )
    return p
  }

  // Issue the `sessions.messages.subscribe` RPC once per socket for a key,
  // tracked by the wire set. Shared by the first-holder path and the reconnect
  // replay; touches no refcounts.
  async function subscribeWire(sessionKey: string): Promise<void> {
    if (sessionSubscriptions.has(sessionKey)) return
    sessionSubscriptions.add(sessionKey)
    try {
      await rpc('sessions.messages.subscribe', { key: sessionKey })
    } catch (err) {
      sessionSubscriptions.delete(sessionKey)
      throw err
    }
  }

  const handle: GatewayHandle = {
    rpc,
    info: () => lastInfo,
    on(l) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    async ensureSessionSubscribed(sessionKey: string) {
      if (!acquireSessionSubscriptionRef(sessionKey)) return // a holder has it
      try {
        await subscribeWire(sessionKey)
      } catch (err) {
        releaseSessionSubscriptionRef(sessionKey) // roll back the demand bump
        throw err
      }
    },
    async releaseSessionSubscription(sessionKey: string) {
      if (!releaseSessionSubscriptionRef(sessionKey)) return // holders remain
      try {
        await rpc('sessions.messages.unsubscribe', { key: sessionKey })
      } catch (err) {
        // Best-effort — the run may already be gone, or the socket dropping is
        // itself an unsubscribe. Log and move on; never throw from teardown.
        console.error('[openclaw-gateway] unsubscribe failed', sessionKey, err)
      }
    },
    resubscribeSessionKey(sessionKey: string) {
      return subscribeWire(sessionKey)
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
  // `openclaw` is an optionalDependency — a missing package must degrade to
  // the silent-null path (no agents discovered), never a rejected promise.
  let GatewayClient: typeof import('openclaw/plugin-sdk/gateway-runtime').GatewayClient
  try {
    ;({ GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime'))
  } catch {
    return null
  }
  let settleConnect!: { res: () => void; rej: (err: Error) => void }
  const connectPromise = new Promise<void>((res, rej) => {
    settleConnect = { res, rej }
  })
  const client = new GatewayClient({
    ...gatewayClientBaseOptions(`ws://127.0.0.1:${cfg.port}`, cfg.token),
    requestTimeoutMs: 2000,
    onHelloOk: (hello: unknown) => {
      lastInfo = parseHelloOk(hello)
      lastFailure = null
      settleConnect.res()
    },
    onConnectError: err => {
      // One-shot callers stay silent by design, but the failure category must
      // still reach /status — a too-old gateway looks like "no agents"
      // otherwise.
      lastFailure = classifyGatewayError(err)
      settleConnect.rej(err)
    }
  })
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error('openclaw connect timeout')), 2000)
      connectPromise.then(
        () => {
          clearTimeout(t)
          res()
        },
        err => {
          clearTimeout(t)
          rej(err)
        }
      )
      client.start()
    })
    return await fn((m, p = {}) => client.request(m, p) as Promise<never>)
  } catch {
    return null
  } finally {
    client.stop()
  }
}
