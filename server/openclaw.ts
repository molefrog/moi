import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export type OpenClawAgent = {
  path: string
  agentId: string
  name?: string
  isDefault: boolean
  lastRunAt?: string
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

export async function discoverOpenClawAgents(): Promise<OpenClawAgent[]> {
  let cfg: { gateway?: { port?: number; auth?: { token?: string } } }
  try {
    const raw = await readFile(join(homedir(), '.openclaw/openclaw.json'), 'utf8')
    cfg = JSON.parse(raw)
  } catch {
    return []
  }
  const port = cfg.gateway?.port
  const token = cfg.gateway?.auth?.token
  if (!port || !token) return []

  let GatewayClient: typeof import('openclaw/plugin-sdk/gateway-runtime').GatewayClient
  try {
    ;({ GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime'))
  } catch {
    return []
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

    const rpc = <T>(method: string, params: Record<string, unknown> = {}) =>
      withTimeout(client.request(method, params) as Promise<T>, TIMEOUT_MS, method)

    const [agents, sessions] = await Promise.all([
      rpc<AgentsList>('agents.list'),
      rpc<SessionsList>('sessions.list', { includeGlobal: true })
    ])

    const identities = await Promise.all(
      agents.agents.map(a =>
        rpc<FileGet>('agents.files.get', {
          agentId: a.id,
          name: 'IDENTITY.md'
        }).catch(() => null)
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
  } catch {
    return []
  } finally {
    client.stop()
  }
}
