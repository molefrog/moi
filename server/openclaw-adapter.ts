// Map OpenClaw gateway shapes into our agent-agnostic display format.
// Stage 1: static only. Each user/assistant message becomes one Turn whose
// parts are derived from the message's content blocks.
import type { Part, StreamEvent, Turn } from '@/lib/format'
import type { SessionInfo } from '@/lib/types'

import type {
  OpenClawContentBlock,
  OpenClawMessage,
  OpenClawSessionDetail,
  OpenClawSessionRow
} from './openclaw'

export function toSessionInfo(row: OpenClawSessionRow, cwd: string): SessionInfo {
  const summary =
    row.lastMessagePreview?.trim() || row.displayName?.trim() || row.label?.trim() || ''
  return {
    sessionId: row.sessionId,
    summary,
    lastModified: row.updatedAt,
    cwd
  }
}

function blockToPart(block: OpenClawContentBlock): Part | null {
  switch (block.type) {
    case 'text': {
      const text =
        typeof (block as { text?: unknown }).text === 'string'
          ? (block as { text: string }).text
          : ''
      if (!text) return null
      return { type: 'text', text }
    }
    case 'thinking': {
      const text =
        typeof (block as { thinking?: unknown }).thinking === 'string'
          ? (block as { thinking: string }).thinking
          : ''
      if (!text) return null
      return { type: 'reasoning', text }
    }
    // Stage 1: tool calls / results are not rendered yet.
    default:
      return null
  }
}

function messageToTurn(msg: OpenClawMessage, sessionKey: string, idx: number): Turn | null {
  if (msg.role !== 'user' && msg.role !== 'assistant') return null
  const blocks: OpenClawContentBlock[] = Array.isArray(msg.content)
    ? msg.content
    : typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : []
  const parts = blocks.map(blockToPart).filter((p): p is Part => p !== null)
  if (parts.length === 0) return null
  return {
    id:
      msg.__openclaw?.id != null
        ? `openclaw:${sessionKey}:${msg.__openclaw.id}`
        : `openclaw:${sessionKey}:${idx}`,
    role: msg.role,
    origin: { kind: 'user-input' },
    parts,
    timestamp: typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : undefined
  }
}

export function toStreamEvents(
  detail: OpenClawSessionDetail | null,
  sessionKey = ''
): StreamEvent[] {
  if (!detail?.messages) return []
  const turns = detail.messages
    .map((m, i) => messageToTurn(m, sessionKey, i))
    .filter((t): t is Turn => t !== null)
  return turns.map(turn => ({ kind: 'turn', turn }))
}
