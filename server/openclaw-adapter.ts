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
//
// Two callers:
//   - `toStreamEvents(detail)` — static path used for cold-load (REST endpoint)
//     and tests.
//   - `messageToTurnLive(msg, sessionKey, idx, results)` — incremental path used
//     by the live session adapter (`openclaw-session.ts`) when a single
//     `session.message` frame arrives.
import type { Part, StreamEvent, ToolCall, ToolState, Turn, TurnMeta } from '@/lib/format'
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

export type ToolResultInfo = { output: string; isError: boolean; toolName?: string }

// Pull a readable `output` string out of a `toolResult` message. OpenClaw
// ships content as blocks; in practice tool output is one or more text
// blocks, so we concatenate them. Non-text blocks (images, etc.) are
// represented as a `[type]` placeholder so we don't silently drop them.
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

export function toolResultFromMessage(
  msg: OpenClawMessage
): { id: string; info: ToolResultInfo } | null {
  if (msg.role !== 'toolResult') return null
  const id = (msg as { toolCallId?: unknown }).toolCallId
  if (typeof id !== 'string') return null
  const toolName = (msg as { toolName?: unknown }).toolName
  return {
    id,
    info: {
      output: flattenToolResultContent(msg.content),
      isError: (msg as { isError?: unknown }).isError === true,
      ...(typeof toolName === 'string' ? { toolName } : {})
    }
  }
}

function collectToolResults(messages: OpenClawMessage[]): Map<string, ToolResultInfo> {
  const map = new Map<string, ToolResultInfo>()
  for (const msg of messages) {
    const r = toolResultFromMessage(msg)
    if (r) map.set(r.id, r.info)
  }
  return map
}

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
  if (
    (openclawName === 'read' || openclawName === 'write' || openclawName === 'edit') &&
    typeof src.path === 'string' &&
    typeof src.file_path !== 'string'
  ) {
    return { ...src, file_path: src.path }
  }
  return input
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

// Pull assistant-side metadata (model, provider, usage, stopReason) into our
// per-turn meta slot. OpenClaw only ships these on assistant rows.
function extractTurnMeta(msg: OpenClawMessage): TurnMeta | undefined {
  if (msg.role !== 'assistant') return undefined
  const m = msg as Record<string, unknown>
  const meta: TurnMeta = {}
  if (typeof m.model === 'string') meta.model = m.model
  if (typeof m.provider === 'string') meta.provider = m.provider
  if (typeof m.stopReason === 'string') meta.stopReason = m.stopReason
  if (m.usage && typeof m.usage === 'object') {
    const u = m.usage as Record<string, unknown>
    const usage: NonNullable<TurnMeta['usage']> = {}
    if (typeof u.input === 'number') usage.inputTokens = u.input
    if (typeof u.output === 'number') usage.outputTokens = u.output
    if (typeof u.totalTokens === 'number') usage.totalTokens = u.totalTokens
    const cost = u.cost as Record<string, unknown> | undefined
    if (cost && typeof cost.total === 'number') usage.costUsd = cost.total
    if (Object.keys(usage).length > 0) meta.usage = usage
  }
  return Object.keys(meta).length > 0 ? meta : undefined
}

// Build a Turn from one OpenClaw message. `idx` is only used as a fallback
// suffix when the message lacks `__openclaw.id` (rare — the gateway emits it
// on durable rows). For streaming we reject id-less messages upstream so we
// never see that case live.
export function messageToTurn(
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
  const ocId = msg.__openclaw?.id
  const seq = msg.__openclaw?.seq
  const meta = extractTurnMeta(msg)
  // Inter-session provenance — exposed on the wire so the UI can render or
  // collapse agent-to-agent prompts differently from human input.
  const provenance = (msg as { provenance?: unknown }).provenance
  const isInterSession =
    provenance &&
    typeof provenance === 'object' &&
    (provenance as { kind?: unknown }).kind === 'inter_session'
  return {
    id: ocId != null ? `openclaw:${sessionKey}:${ocId}` : `openclaw:${sessionKey}:${idx}`,
    role: msg.role,
    origin: { kind: msg.role === 'user' && isInterSession ? 'inter-session' : 'user-input' },
    parts,
    timestamp:
      typeof msg.timestamp === 'number' ? new Date(msg.timestamp).toISOString() : undefined,
    ...(typeof seq === 'number' ? { seq } : {}),
    ...(meta ? { meta } : {})
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

// Find every assistant message that has a `toolCall` block with `toolCallId`.
// Used by the live session: when a `toolResult` lands, we re-emit the prior
// assistant turns that referenced that id, so the result folds into the card.
export function findToolCallOwners(
  messages: Iterable<OpenClawMessage>,
  toolCallId: string
): OpenClawMessage[] {
  const owners: OpenClawMessage[] = []
  for (const m of messages) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const b of m.content) {
      if (
        b &&
        typeof b === 'object' &&
        b.type === 'toolCall' &&
        (b as { id?: unknown }).id === toolCallId
      ) {
        owners.push(m)
        break
      }
    }
  }
  return owners
}
