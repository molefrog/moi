import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import * as path from 'path'

import type { ServerMessage, SessionInfo } from '@/lib/types'

export const WORKSPACE = path.join(import.meta.dir, '..', 'workspace')
export const cwd = WORKSPACE

export const clients = new Set<Bun.ServerWebSocket<unknown>>()

// Per-session agent state — the ONLY mutable state
type Agent = { processing: boolean; abortController: AbortController | null }
const agents = new Map<string, Agent>()

export function getAgent(id: string): Agent {
  if (!agents.has(id)) agents.set(id, { processing: false, abortController: null })
  return agents.get(id)!
}

export function renameAgent(from: string, to: string) {
  const a = agents.get(from)
  if (!a) return
  agents.set(to, a)
  agents.delete(from)
}

export function getProcessingSessions(): string[] {
  const result: string[] = []
  for (const [id, a] of agents) if (a.processing) result.push(id)
  return result
}

export function broadcast(msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const ws of clients) ws.send(json)
}

export function sendToClient(ws: Bun.ServerWebSocket<unknown>, msg: ServerMessage) {
  ws.send(JSON.stringify(msg))
}

// ---- transformMessage: SDK → ChatMessage[] ----

type ContentBlock = {
  type: string
  text?: string
  name?: string
  id?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as ContentBlock[])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('\n')
  }
  return ''
}

export function transformMessage(msg: {
  type: string
  message: unknown
}): Array<
  | { type: 'user'; content: string }
  | { type: 'assistant'; content: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }
> {
  const result: ReturnType<typeof transformMessage> = []
  const content = (msg.message as { content?: unknown })?.content
  if (msg.type === 'user') {
    if (Array.isArray(content)) {
      for (const b of content as ContentBlock[]) {
        if (b.type === 'text' && b.text && !b.text.startsWith('<')) {
          result.push({ type: 'user', content: b.text })
        }
        if (b.type === 'tool_result') {
          result.push({
            type: 'tool_result',
            tool_use_id: b.tool_use_id!,
            content: extractText(b.content).slice(0, 2000),
            is_error: !!b.is_error
          })
        }
      }
    } else if (typeof content === 'string' && !content.startsWith('<')) {
      result.push({ type: 'user', content })
    }
  }
  if (msg.type === 'assistant') {
    if (Array.isArray(content)) {
      for (const b of content as ContentBlock[]) {
        if (b.type === 'text' && b.text) {
          result.push({ type: 'assistant', content: b.text })
        }
        if (b.type === 'tool_use') {
          result.push({
            type: 'tool_use',
            id: b.id!,
            name: b.name!,
            input: (b.input ?? {}) as Record<string, unknown>
          })
        }
      }
    }
  }
  return result
}

export async function getSessions(): Promise<SessionInfo[]> {
  const sessions = await listSessions({ dir: WORKSPACE })
  return sessions.map(s => ({
    sessionId: s.sessionId,
    summary: s.summary,
    lastModified: s.lastModified,
    cwd: s.cwd
  }))
}
