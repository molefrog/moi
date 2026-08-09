// Version/feature tolerance for the OpenClaw gateway.
//
// moi speaks gateway wire protocol 4 — the protocol of the current line
// (2026.7.x) and the previous still-maintained line (2026.6.x). The two lines
// differ only in small field placements, handled by the helpers here (all
// verified against live gateways: 2026.7.1 and 2026.6.33). Protocol-3
// gateways (≤ 2026.5.x) refuse the handshake with "protocol mismatch"; those
// are detected and surfaced as a status, never silently swallowed.
//
// Rule for future params: old gateways validate params with
// `additionalProperties: false` and reject unknown fields outright — never
// send a param that only newer schemas know without gating on `GatewayInfo`.

// What the gateway announced in `hello-ok`. `methods`/`events` are advisory
// and UNDER-REPORT: 2026.6.33 answers `sessions.get` while omitting it from
// `features.methods`. Absence proves nothing, so nothing gates on this — the
// sets are carried for `/status` and for debugging a version mismatch.
export type GatewayInfo = {
  protocol?: number
  serverVersion?: string
  methods: Set<string>
  events: Set<string>
}

export function parseHelloOk(hello: unknown): GatewayInfo {
  const h = hello as
    | {
        protocol?: unknown
        server?: { version?: unknown }
        features?: { methods?: unknown; events?: unknown }
      }
    | undefined
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return {
    protocol: typeof h?.protocol === 'number' ? h.protocol : undefined,
    serverVersion: typeof h?.server?.version === 'string' ? h.server.version : undefined,
    methods: new Set(strings(h?.features?.methods)),
    events: new Set(strings(h?.features?.events))
  }
}

export type GatewayFailureKind = 'protocol-mismatch' | 'auth' | 'unreachable' | 'unknown'

export type GatewayFailure = {
  kind: GatewayFailureKind
  message: string
}

// Map a connect/RPC error onto a stable category the UI can explain. The
// protocol-mismatch string is the gateway's own wording (verified against a
// live 2026.4.22 gateway). `gatewayCode` (GatewayClientRequestError) is
// preferred over message sniffing when present.
export function classifyGatewayError(err: unknown): GatewayFailure {
  const raw = err instanceof Error ? err.message : String(err)
  const code = (err as { gatewayCode?: unknown } | undefined)?.gatewayCode
  const lower = raw.toLowerCase()
  if (lower.includes('protocol mismatch')) {
    return {
      kind: 'protocol-mismatch',
      message:
        'OpenClaw gateway speaks an older protocol than this moi build. Update OpenClaw (2026.6 or newer) to reconnect.'
    }
  }
  if (code === 'UNAUTHORIZED' || lower.includes('unauthorized')) {
    return { kind: 'auth', message: `OpenClaw gateway rejected the connection: ${raw}` }
  }
  if (
    lower.includes('refused') ||
    lower.includes('timeout') ||
    lower.includes('econn') ||
    lower.includes('enotfound') ||
    lower.includes('closed')
  ) {
    return { kind: 'unreachable', message: 'OpenClaw gateway is not reachable.' }
  }
  return { kind: 'unknown', message: raw }
}

// The durable user-echo carries `<runId>:user` so sends can be matched
// exactly. 2026.7.x nests it under `__openclaw.idempotencyKey`; 2026.6.x puts
// it on the message itself.
export function messageIdempotencyKey(msg: unknown): string | undefined {
  const m = msg as
    | { idempotencyKey?: unknown; __openclaw?: { idempotencyKey?: unknown } }
    | undefined
  const nested = m?.__openclaw?.idempotencyKey
  if (typeof nested === 'string') return nested
  const flat = m?.idempotencyKey
  return typeof flat === 'string' ? flat : undefined
}

// Thinking levels are NOT gateway-global — they resolve per model, and the
// gateway rejects a level outside the resolved model's set. See `thinking.ts`,
// which learns each model's menu from the session rows that carry it.
