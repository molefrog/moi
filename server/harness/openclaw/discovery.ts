import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import type { Model } from '@/lib/types'

import { getGateway } from './gateway'
import type { GatewayHandle } from './gateway'
import { stripUserMessageMetadata } from './strip'

export type OpenClawAgent = {
  path: string
  agentId: string
  name?: string
  isDefault: boolean
  lastRunAt?: string
}

// Subset of the session row returned by `sessions.list`. The gateway ships
// more fields, but these are the ones we map to our SessionInfo/StreamEvent.
export type OpenClawSessionRow = {
  key: string
  sessionId: string
  updatedAt: number
  lastMessagePreview?: string
  displayName?: string
  label?: string
  model?: string
  modelProvider?: string
  status?: string
}

// Shape returned by `sessions.get({ key })` — the full transcript, unlike
// `sessions.preview` which is capped at ~11 items regardless of maxChars.
export type OpenClawContentBlock =
  | { type: 'text'; text: string; textSignature?: string }
  | { type: 'thinking'; thinking: string; thinkingSignature?: string }
  | { type: 'toolCall'; id: string; name: string; arguments: unknown }
  | { type: string; [k: string]: unknown }

export type OpenClawMessage = {
  role: 'user' | 'assistant' | 'toolResult' | string
  content: OpenClawContentBlock[] | string
  timestamp?: number
  __openclaw?: { id?: string; seq?: number }
}

export type OpenClawSessionDetail = {
  messages: OpenClawMessage[]
}

export type OpenClawSessionPreviewCandidate = {
  key: string
  updatedAt: number
  detail: OpenClawSessionDetail | null
}

export type OpenClawWorkspacePreview = {
  firstUserMessage?: string
  updatedAt?: number
}

const TIMEOUT_MS = 2000

type AgentsList = {
  defaultId: string
  agents: Array<{ id: string; workspace: string }>
}
type SessionsList = {
  sessions: Array<{ key: string; updatedAt: number }>
}
type FileGet = { file?: { content?: string } }

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`openclaw ${label} timed out after ${ms}ms`)), ms)
    p.then(
      v => {
        clearTimeout(t)
        res(v)
      },
      e => {
        clearTimeout(t)
        rej(e)
      }
    )
  })
}

function parseIdentityName(md: string | undefined): string | undefined {
  if (!md) return undefined
  const m = /^-\s*\*\*Name:\*\*\s*(.+)$/m.exec(md)
  return m ? m[1].trim() : undefined
}

type Rpc = <T>(method: string, params?: Record<string, unknown>) => Promise<T>

// Connect, hand the scoped `rpc(method, params)` to `fn`, then stop the client.
// Any connect/auth/timeout failure → returns `null` silently (caller's choice).
async function withGatewayClient<T>(fn: (rpc: Rpc) => Promise<T>): Promise<T | null> {
  let cfg: { gateway?: { port?: number; auth?: { token?: string } } }
  try {
    const raw = await readFile(join(homedir(), '.openclaw/openclaw.json'), 'utf8')
    cfg = JSON.parse(raw)
  } catch {
    return null
  }
  const port = cfg.gateway?.port
  const token = cfg.gateway?.auth?.token
  if (!port || !token) return null

  let GatewayClient: typeof import('openclaw/plugin-sdk/gateway-runtime').GatewayClient
  try {
    ;({ GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime'))
  } catch {
    return null
  }

  const client = new GatewayClient({
    url: `ws://127.0.0.1:${port}`,
    token,
    role: 'operator',
    scopes: ['operator.admin', 'operator.read', 'operator.write'],
    requestTimeoutMs: TIMEOUT_MS
  })

  const connect = new Promise<void>((res, rej) => {
    client.opts.onHelloOk = () => res()
    client.opts.onConnectError = rej
  })

  try {
    client.start()
    await withTimeout(connect, TIMEOUT_MS, 'connect')
    const rpc: Rpc = (method, params = {}) =>
      withTimeout(client.request(method, params), TIMEOUT_MS, method)
    return await fn(rpc)
  } catch {
    return null
  } finally {
    client.stop()
  }
}

export async function discoverOpenClawAgents(): Promise<OpenClawAgent[]> {
  const out = await withGatewayClient(async rpc => {
    const [agents, sessions] = await Promise.all([
      rpc<AgentsList>('agents.list'),
      rpc<SessionsList>('sessions.list', { includeGlobal: true })
    ])

    const identities = await Promise.all(
      agents.agents.map(a =>
        rpc<FileGet>('agents.files.get', { agentId: a.id, name: 'IDENTITY.md' }).catch(() => null)
      )
    )

    const lastRun = new Map<string, number>()
    for (const s of sessions.sessions) {
      const m = /^agent:([^:]+):/.exec(s.key)
      if (!m) continue
      const cur = lastRun.get(m[1]) ?? 0
      if (s.updatedAt > cur) lastRun.set(m[1], s.updatedAt)
    }

    return agents.agents.map((a, i) => {
      const ts = lastRun.get(a.id)
      return {
        path: resolve(a.workspace),
        agentId: a.id,
        name: parseIdentityName(identities[i]?.file?.content),
        isDefault: a.id === agents.defaultId,
        lastRunAt: ts ? new Date(ts).toISOString() : undefined
      }
    })
  })
  return out ?? []
}

// Resolve an OpenClaw agentId for a workspace path. Used when the saved
// workspace entry was registered before we started capturing agentId.
async function resolveAgentIdForPath(rpc: Rpc, path: string): Promise<string | undefined> {
  const agents = await rpc<AgentsList>('agents.list')
  return agents.agents.find(a => resolve(a.workspace) === resolve(path))?.id
}

export async function getOpenClawSessions(
  workspacePath: string,
  agentId?: string
): Promise<OpenClawSessionRow[]> {
  const out = await withGatewayClient(async rpc => {
    const id = agentId ?? (await resolveAgentIdForPath(rpc, workspacePath))
    if (!id) return []
    const res = await rpc<{ sessions: OpenClawSessionRow[] }>('sessions.list', {
      agentId: id,
      includeLastMessage: true
    })
    return res.sessions
  })
  return out ?? []
}

export async function getOpenClawSessionMessages(
  sessionId: string,
  workspacePath: string,
  agentId?: string
): Promise<OpenClawSessionDetail | null> {
  const out = await withGatewayClient(async rpc => {
    const id = agentId ?? (await resolveAgentIdForPath(rpc, workspacePath))
    if (!id) return null

    // sessionId → key. `sessions.get` needs the composite key, not sessionId.
    const resolved = await rpc<{ key?: string }>('sessions.resolve', {
      sessionId,
      agentId: id
    }).catch(() => null)
    const key = resolved?.key
    if (!key) return null

    return await rpc<OpenClawSessionDetail>('sessions.get', { key })
  })
  return out ?? null
}

function firstUserMessageText(detail: OpenClawSessionDetail | null): string | undefined {
  const message = detail?.messages.find(candidate => candidate.role === 'user')
  if (!message) return undefined

  const raw =
    typeof message.content === 'string'
      ? message.content
      : message.content
          .filter(
            (block): block is Extract<OpenClawContentBlock, { type: 'text' }> =>
              block.type === 'text'
          )
          .map(block => block.text)
          .join('\n')
  const text = stripUserMessageMetadata(raw).trim()
  return text || undefined
}

export function selectOldestOpenClawFirstUserMessage(
  candidates: OpenClawSessionPreviewCandidate[]
): string | undefined {
  const oldest = candidates.slice().sort((a, b) => {
    const aCreatedAt =
      a.detail?.messages.find(message => typeof message.timestamp === 'number')?.timestamp ??
      a.updatedAt
    const bCreatedAt =
      b.detail?.messages.find(message => typeof message.timestamp === 'number')?.timestamp ??
      b.updatedAt
    return aCreatedAt - bCreatedAt || a.key.localeCompare(b.key)
  })[0]
  return oldest ? firstUserMessageText(oldest.detail) : undefined
}

export function selectLatestOpenClawUpdatedAt(
  sessions: Pick<OpenClawSessionRow, 'updatedAt'>[]
): number | undefined {
  return sessions.reduce<number | undefined>(
    (latest, session) =>
      latest === undefined || session.updatedAt > latest ? session.updatedAt : latest,
    undefined
  )
}

// Session-set identity for the first-user-message cache: transcripts are
// append-only, so once the oldest session's first message exists it can only
// change when a session is added or removed. Order-insensitive.
export function openClawSessionSetSignature(sessions: Pick<OpenClawSessionRow, 'key'>[]): string {
  return sessions
    .map(session => session.key)
    .sort()
    .join('\n')
}

const firstUserMessageCache = new Map<string, { signature: string; message: string }>()

export async function getOpenClawWorkspacePreview(
  workspacePath: string,
  agentId: string | undefined,
  includeFirstUserMessage: boolean
): Promise<OpenClawWorkspacePreview> {
  // Preview reads ride the shared persistent gateway connection instead of a
  // one-shot client per home-page card; per-call timeouts keep the card fast
  // when the gateway is up but slow.
  let gateway: GatewayHandle
  try {
    gateway = await getGateway()
  } catch {
    return {}
  }
  const rpc: Rpc = (method, params = {}) =>
    withTimeout(gateway.rpc(method, params), TIMEOUT_MS, method)

  try {
    const id = agentId ?? (await resolveAgentIdForPath(rpc, workspacePath))
    if (!id) return {}

    const res = await rpc<{ sessions: OpenClawSessionRow[] }>('sessions.list', {
      agentId: id
    })
    const updatedAt = selectLatestOpenClawUpdatedAt(res.sessions)
    if (!includeFirstUserMessage) {
      return updatedAt !== undefined ? { updatedAt } : {}
    }

    const signature = openClawSessionSetSignature(res.sessions)
    const cached = firstUserMessageCache.get(workspacePath)
    let firstUserMessage = cached?.signature === signature ? cached.message : undefined

    if (firstUserMessage === undefined) {
      const candidates = await Promise.all(
        res.sessions.map(async session => ({
          key: session.key,
          updatedAt: session.updatedAt,
          detail: await rpc<OpenClawSessionDetail>('sessions.get', { key: session.key }).catch(
            () => null
          )
        }))
      )
      firstUserMessage = selectOldestOpenClawFirstUserMessage(candidates)
      // Only cache found messages: a session without a user message yet can
      // gain one later without the session set changing.
      if (firstUserMessage) {
        firstUserMessageCache.set(workspacePath, { signature, message: firstUserMessage })
      }
    }

    return {
      ...(firstUserMessage ? { firstUserMessage } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {})
    }
  } catch {
    return {}
  }
}

// One entry from the gateway's `models.list` catalog. The catalog is
// gateway-wide (no per-agent param) — the allowed model set filtered by config.
type OpenClawModelChoice = {
  id: string
  name: string
  provider: string
  alias?: string
  contextWindow?: number
  reasoning?: boolean
}

export async function getOpenClawModels(): Promise<Model[]> {
  const out = await withGatewayClient(async rpc => {
    const res = await rpc<{ models: OpenClawModelChoice[] }>('models.list')
    return res.models
  })
  // Map the gateway catalog onto the raw Model shape (value/displayName).
  return (out ?? []).map(m => ({ value: m.id, displayName: m.name }))
}
