// Map OpenClaw gateway shapes into our agent-agnostic display format.
//
// OpenClaw stores one `OpenClawMessage` per role-turn: `user` (the prompt,
// with AI-facing envelopes prepended — see `openclaw-strip.ts`), `assistant`
// (text/reasoning/toolCall blocks + model metadata), and `toolResult` (one
// per executed tool call, keyed by `toolCallId`). We turn that into:
//   - one Turn per user/assistant message, with tool-call parts rendered
//     inline on the assistant turn,
//   - no separate turn for toolResult rows — results are folded into the
//     assistant's matching tool-call part so the UI shows them as expandable
//     output under the call.
import type { Part, StreamEvent, ToolCall, ToolState, Turn } from '@/lib/format'
import type { SessionInfo } from '@/lib/types'

import type {
  OpenClawContentBlock,
  OpenClawMessage,
  OpenClawSessionDetail,
  OpenClawSessionRow
} from './openclaw'
import { stripUserMessageMetadata } from './openclaw-strip'

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

type ToolResultInfo = { output: string; isError: boolean }

// Pull a readable `output` string out of a `toolResult` message. OpenClaw
// ships content as blocks; in practice tool output is one or more text
// blocks, so we concatenate them. Non-text blocks (images, etc.) are
// represented as a `[type]` placeholder so we don't silently drop them.
// OpenClaw agents expose lowercase tool names (`read`, `edit`, `exec`,
// `update_plan`) with `path`/`command` arg keys. The client's tool cards were
// written for Claude Code's PascalCase names (`Read`, `Bash`) with
// `file_path`/`command`. We normalize here so the UI doesn't have to branch.
const TOOL_NAME_ALIASES: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  exec: 'Bash',
  glob: 'Glob',
  grep: 'Grep'
}

function normalizeToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] ?? name
}

function normalizeToolInput(openclawName: string, input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input
  const src = input as Record<string, unknown>
  // `read` / `write` / `edit` → rename `path` to `file_path` for the shared
  // tool-card brief. Leave other keys intact so the raw JSON is still visible
  // in the expanded view.
  if (
    (openclawName === 'read' || openclawName === 'write' || openclawName === 'edit') &&
    typeof src.path === 'string' &&
    typeof src.file_path !== 'string'
  ) {
    return { ...src, file_path: src.path }
  }
  return input
}

function flattenToolResultContent(content: OpenClawMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (!block || typeof block !== 'object') return ''
      if (block.type === 'text') {
        const v = (block as { text?: unknown }).text
        return typeof v === 'string' ? v : ''
      }
      return `[${block.type}]`
    })
    .filter(Boolean)
    .join('\n')
}

function collectToolResults(messages: OpenClawMessage[]): Map<string, ToolResultInfo> {
  const map = new Map<string, ToolResultInfo>()
  for (const msg of messages) {
    if (msg.role !== 'toolResult') continue
    const id = (msg as { toolCallId?: unknown }).toolCallId
    if (typeof id !== 'string') continue
    map.set(id, {
      output: flattenToolResultContent(msg.content),
      isError: (msg as { isError?: unknown }).isError === true
    })
  }
  return map
}

function blockToPart(
  block: OpenClawContentBlock,
  role: OpenClawMessage['role'],
  results: Map<string, ToolResultInfo>
): Part | null {
  switch (block.type) {
    case 'text': {
      const raw =
        typeof (block as { text?: unknown }).text === 'string'
          ? (block as { text: string }).text
          : ''
      const text = role === 'user' ? stripUserMessageMetadata(raw) : raw
      if (!text) return null
      return { type: 'text', text }
    }
    case 'thinking': {
      const text =
        typeof (block as { thinking?: unknown }).thinking === 'string'
          ? (block as { thinking: string }).thinking
          : ''
      if (!text) return null
      const sig = (block as { thinkingSignature?: unknown }).thinkingSignature
      return {
        type: 'reasoning',
        text,
        ...(typeof sig === 'string' ? { signature: sig } : {})
      }
    }
    case 'toolCall': {
      const id = (block as { id?: unknown }).id
      const name = (block as { name?: unknown }).name
      if (typeof id !== 'string' || typeof name !== 'string') return null
      const result = results.get(id)
      let state: ToolState = 'pending'
      if (result) state = result.isError ? 'error' : 'success'
      const call: ToolCall = {
        toolCallId: id,
        name: normalizeToolName(name),
        caller: 'model',
        state,
        input: normalizeToolInput(name, (block as { arguments?: unknown }).arguments)
      }
      if (result) {
        if (result.isError) call.errorText = result.output
        else call.output = result.output
      }
      return { type: 'tool-call', call }
    }
    default:
      return null
  }
}

function messageToTurn(
  msg: OpenClawMessage,
  sessionKey: string,
  idx: number,
  results: Map<string, ToolResultInfo>
): Turn | null {
  if (msg.role !== 'user' && msg.role !== 'assistant') return null
  const blocks: OpenClawContentBlock[] = Array.isArray(msg.content)
    ? msg.content
    : typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : []
  const parts = blocks
    .map(b => blockToPart(b, msg.role, results))
    .filter((p): p is Part => p !== null)
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
  const results = collectToolResults(detail.messages)
  const turns = detail.messages
    .map((m, i) => messageToTurn(m, sessionKey, i, results))
    .filter((t): t is Turn => t !== null)
  return turns.map(turn => ({ kind: 'turn', turn }))
}
