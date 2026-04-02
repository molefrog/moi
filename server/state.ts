import { getSessionMessages, listSessions } from '@anthropic-ai/claude-agent-sdk'
import * as path from 'path'

import type { ChatMessage, ServerMessage } from '@/lib/types'

export const WORKSPACE = path.join(import.meta.dir, '..', 'workspace')

export let sessionId: string | null = null
export const messages: ChatMessage[] = []
export let processing = false
export let abortController: AbortController | null = null
export const clients = new Set<Bun.ServerWebSocket<unknown>>()

export function setSessionId(id: string) {
  sessionId = id
}

export function setProcessing(value: boolean) {
  processing = value
}

export function setAbortController(controller: AbortController | null) {
  abortController = controller
}

export function broadcast(msg: ServerMessage) {
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    ws.send(json)
  }
}

export function record(msg: ChatMessage) {
  messages.push(msg)
  broadcast(msg)
}

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

function transformMessages(
  rawMessages: Awaited<ReturnType<typeof getSessionMessages>>
): ChatMessage[] {
  const result: ChatMessage[] = []
  for (const msg of rawMessages) {
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
  }
  return result
}

export async function initState() {
  const sessions = await listSessions({ dir: WORKSPACE })
  if (sessions.length === 0) {
    console.log('[state] no sessions found')
    return
  }
  const latest = sessions[0]
  sessionId = latest.sessionId
  console.log(`[state] resuming session ${sessionId} (${latest.summary.slice(0, 60)})`)
  const rawMessages = await getSessionMessages(sessionId, { dir: WORKSPACE })
  const loaded = transformMessages(rawMessages)
  messages.push(...loaded)
  console.log(`[state] loaded ${loaded.length} messages`)
}
