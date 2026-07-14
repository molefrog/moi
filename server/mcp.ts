import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  McpServerConfig,
  McpServerStatus,
  SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { join } from 'path'

import { debugEnabled } from './debug'

export type McpScope = 'user' | 'project'

// MCP server status probing. Intentionally decoupled from agent chat runs
// (cc-session.ts): connecting to MCP servers and reading their status is a
// metadata concern, not part of any conversation. Nothing here submits a user
// turn, so probing costs zero model tokens.
//
// Why a streaming-input session that yields nothing: MCP servers (especially
// remote http / claudeai-proxy ones) connect lazily and asynchronously *after*
// session init. A single-shot `prompt: ''` query tears down before those
// handshakes finish, so every server freezes at `pending`. Keeping the session
// open lets the SDK subprocess finish connecting, and we poll the control-
// channel `mcpServerStatus()` until nothing is `pending` (or we time out).

// The SDK's own MCP connection timeout is 60s; cap our wait to match.
const SETTLE_TIMEOUT_MS = 60_000
const POLL_INTERVAL_MS = 750

// A status is settled once it leaves `pending` — every other value is terminal
// for this probe (`connected` / `disabled`, or recoverable `failed` /
// `needs-auth` that only changes on external action, not by waiting).
function isSettled(status: McpServerStatus[]): boolean {
  return status.every(s => s.status !== 'pending')
}

// Log the probe result without drowning the console. By default we print a
// one-line summary — a count of healthy servers plus only the ones that need
// attention (failed / needs-auth / still-pending) called out by name. The full
// per-server dump (every `connected` line too) is opt-in via `moi start --debug`.
// `connected`/`disabled` are the boring majority, so they're folded into counts.
function logMcpStatus(scope: McpScope, status: McpServerStatus[]): void {
  if (debugEnabled) {
    console.log(`[mcp:${scope}]`, status.map(s => `${s.name}:${s.status}`).join(', '))
    return
  }
  const connected = status.filter(s => s.status === 'connected').length
  const disabled = status.filter(s => s.status === 'disabled').length
  const attention = status.filter(s => s.status !== 'connected' && s.status !== 'disabled')
  const parts = [`${connected} connected`]
  if (disabled) parts.push(`${disabled} disabled`)
  for (const s of attention) parts.push(`${s.status}: ${s.name}`)
  console.log(`[mcp:${scope}]`, parts.join(' · '))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function projectMcpServers(workspacePath: string): Promise<Record<string, McpServerConfig>> {
  const file = Bun.file(join(workspacePath, '.mcp.json'))
  if (!(await file.exists())) return {}

  const parsed = await file.json().catch(() => null)
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) return {}

  const servers: Record<string, McpServerConfig> = {}
  for (const [name, config] of Object.entries(parsed.mcpServers)) {
    // The SDK owns the detailed MCP config union; here we only need to confirm
    // the project JSON declares an object keyed by server name before passing it
    // through unchanged.
    if (isRecord(config)) servers[name] = config as unknown as McpServerConfig
  }
  return servers
}

async function probeMcpStatus(workspacePath: string, scope: McpScope): Promise<McpServerStatus[]> {
  // Known gap, revisit: the project probe covers only `.mcp.json` (strict), and
  // the user probe runs from the server's cwd — so servers added via `claude
  // mcp add` (user scope) or `.claude/settings(.local).json` never appear in
  // the workspace connectors menu, even though chat sessions still load them
  // (cc-session runs with settingSources ['user','project']). Surfacing those
  // scopes here needs a per-workspace user+project probe without double-listing
  // servers across the menu and the /connectors page.
  const mcpServers = scope === 'project' ? await projectMcpServers(workspacePath) : undefined
  if (scope === 'project' && Object.keys(mcpServers ?? {}).length === 0) return []

  // A prompt that never yields keeps the session alive without a model turn.
  let release!: () => void
  const done = new Promise<void>(r => (release = r))
  // Never yields by design: yielding would submit a user turn (a model call).
  // We only want the session to stay open while MCP servers connect.
  // eslint-disable-next-line require-yield
  async function* keepAlive(): AsyncGenerator<SDKUserMessage> {
    await done
  }

  const q = query({
    prompt: keepAlive(),
    options: {
      cwd: workspacePath,
      persistSession: false,
      settingSources: [scope],
      ...(mcpServers && { mcpServers, strictMcpConfig: true }),
      env: { ...process.env, CLAUDECODE: undefined }
    }
  })

  try {
    const start = Date.now()
    let status: McpServerStatus[] = []
    while (Date.now() - start < SETTLE_TIMEOUT_MS) {
      status = await q.mcpServerStatus()
      if (isSettled(status)) break
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }
    logMcpStatus(scope, status)
    return status
  } finally {
    release()
    // This metadata-only probe intentionally never submits a user turn, so the
    // SDK may report that it was closed before receiving a response.
    try {
      q.close()
    } catch {
      // The connector status is already settled, so cleanup must not replace it.
    }
  }
}

// Cache holds a *settled* snapshot for a bounded, content-dependent time — never
// a cold/pending result, never forever. TTL by volatility: a healthy server
// stays put, but `failed`/`needs-auth` can recover on external action, so we
// re-probe those sooner. A still-`pending` snapshot (we hit the timeout) is not
// cached at all.
const HEALTHY_TTL_MS = 5 * 60_000
const RECOVERABLE_TTL_MS = 30_000

function ttlFor(status: McpServerStatus[]): number {
  if (status.some(s => s.status === 'pending')) return 0
  if (status.some(s => s.status === 'failed' || s.status === 'needs-auth')) {
    return RECOVERABLE_TTL_MS
  }
  return HEALTHY_TTL_MS
}

type CacheEntry = { status: McpServerStatus[]; expiresAt: number }
const cache = new Map<string, CacheEntry>()
// Collapse concurrent callers onto a single in-flight probe (it takes a few
// seconds to settle). Client-side caching makes stampedes unlikely, but this is
// cheap insurance against parallel probes of the same workspace.
const inflight = new Map<string, Promise<McpServerStatus[]>>()

function cacheKey(scope: McpScope, workspacePath: string): string {
  return `${scope}:${workspacePath}`
}

export async function getMcpStatus(
  workspacePath: string,
  scope: McpScope = 'project'
): Promise<McpServerStatus[]> {
  const key = cacheKey(scope, workspacePath)
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.status

  const existing = inflight.get(key)
  if (existing) return existing

  const probe = probeMcpStatus(workspacePath, scope)
    .then(status => {
      const ttl = ttlFor(status)
      if (ttl > 0) cache.set(key, { status, expiresAt: Date.now() + ttl })
      return status
    })
    .finally(() => inflight.delete(key))

  inflight.set(key, probe)
  return probe
}

export async function getUserMcpStatus(): Promise<McpServerStatus[]> {
  return getMcpStatus(process.cwd(), 'user')
}
