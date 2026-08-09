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
} from './discovery'
import { formatChatTitle } from '@/lib/chat-title'
import { stripMoiContextLoose } from '@/lib/moi-context'
import { stripSubagentEnvelope, stripUserMessageMetadata } from './strip'

// moi appends the `<moi-context>` envelope to the user's message text because
// `sessions.send` has no separate system channel — so the gateway derives
// `displayName`/`derivedTitle`/`lastMessagePreview` from a message that
// carries the envelope. Strip it (loose: truncation can cut it open) from
// every title source, not just the preview, so no title shows the envelope.
// A no-op on channel/cron labels that never contain it.
function cleanTitle(text: string | undefined): string {
  return stripSubagentEnvelope(stripMoiContextLoose(text?.trim() ?? '')).trim()
}

export function toSessionInfo(row: OpenClawSessionRow, cwd: string): SessionInfo {
  const summary =
    cleanTitle(row.label) ||
    cleanTitle(row.displayName) ||
    cleanTitle(row.derivedTitle) ||
    formatChatTitle(cleanTitle(row.lastMessagePreview)) ||
    ''
  // External channel provenance. 'webchat' is moi's own chat surface — only
  // real external channels (telegram/irc/discord/…) get an origin badge.
  const provider = row.origin?.provider
  const label = row.origin?.label
  const origin =
    provider && provider !== 'webchat' ? { provider, ...(label ? { label } : {}) } : undefined
  // Flavor from the gateway key layout: cron buckets are `…:cron:<jobId>`,
  // spawned subagents carry `spawnedBy` (and live under `…:subagent:<uuid>`).
  const flavor: SessionInfo['flavor'] = row.key.includes(':cron:')
    ? 'cron'
    : row.spawnedBy || row.key.includes(':subagent:')
      ? 'subagent'
      : undefined
  return {
    sessionId: row.sessionId,
    summary,
    lastModified: row.updatedAt,
    cwd,
    ...(origin ? { origin } : {}),
    ...(flavor ? { flavor } : {})
  }
}

// `running` marks a live `session.tool` start/update frame — the call is
// executing and has no output yet. A final result (stream or durable row)
// overwrites the entry.
export type ToolResultInfo = {
  output: string
  isError: boolean
  toolName?: string
  running?: boolean
}

// Pull a readable `output` string out of a `toolResult` message. The tool
// result wire shape has drifted across OpenClaw lines (verified live):
//   - 2026.7.1  — `content: [{ type: 'text', text: 'hello' }]` (flat text)
//   - 2026.7.2+ — the exec sandbox nests the result as `[{ type: 'text',
//     text: '<json>' }]` or wraps it in a `{ type: 'toolResult', content: […] }`
//     block (which rendered as a bare `[toolResult]` placeholder before this).
// So recurse: text/image blocks resolve directly, any other block that
// carries its own `content` array or `text`/`output` string is unwrapped one
// level, and only a truly opaque block falls back to `[type]`.
export function flattenToolResultContent(content: OpenClawMessage['content'], depth = 0): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(block => {
      if (!block || typeof block !== 'object') return ''
      const b = block as {
        type?: unknown
        text?: unknown
        content?: unknown
        output?: unknown
      }
      if (b.type === 'text') return typeof b.text === 'string' ? b.text : ''
      if (b.type === 'image') return '[image]'
      // Nested wrapper (e.g. a `toolResult` block): unwrap one level.
      if (depth < 3) {
        if (Array.isArray(b.content)) {
          const inner = flattenToolResultContent(b.content as OpenClawMessage['content'], depth + 1)
          if (inner) return inner
        }
        if (typeof b.text === 'string' && b.text) return b.text
        if (typeof b.output === 'string' && b.output) return b.output
      }
      return typeof b.type === 'string' ? `[${b.type}]` : ''
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

function blockToPart(
  block: OpenClawContentBlock,
  role: OpenClawMessage['role'],
  results: Map<string, ToolResultInfo>,
  omitToolCallIds?: ReadonlySet<string>
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
    case 'thinking':
    case 'reasoning': {
      // Field drift across OpenClaw lines: 2026.7.1 ships `{ type: 'thinking',
      // thinking, thinkingSignature }`; newer lines emit `reasoning` and/or
      // carry the text in `text`. Read whichever is present so the Thought row
      // never silently vanishes.
      const b = block as {
        thinking?: unknown
        reasoning?: unknown
        text?: unknown
        thinkingSignature?: unknown
        signature?: unknown
      }
      const text =
        (typeof b.thinking === 'string' && b.thinking) ||
        (typeof b.reasoning === 'string' && b.reasoning) ||
        (typeof b.text === 'string' && b.text) ||
        ''
      if (!text) return null
      const sig =
        (typeof b.thinkingSignature === 'string' && b.thinkingSignature) ||
        (typeof b.signature === 'string' && b.signature) ||
        undefined
      return {
        type: 'reasoning',
        text,
        ...(sig ? { signature: sig } : {})
      }
    }
    case 'toolCall': {
      const id = (block as { id?: unknown }).id
      const name = (block as { name?: unknown }).name
      if (typeof id !== 'string' || typeof name !== 'string') return null
      // This call is already on screen as its own live card (the live session
      // rendered it before this row carried the block). Rendering it here too
      // would show the same call twice, and a broadcast card can't be
      // retracted — so the live card keeps ownership for the session's life.
      if (omitToolCallIds?.has(id)) return null
      const result = results.get(id)
      let state: ToolState = 'pending'
      if (result) state = result.running ? 'running' : result.isError ? 'error' : 'success'
      const call: ToolCall = {
        toolCallId: id,
        name,
        caller: 'model',
        provider: 'openclaw',
        state,
        input: (block as { arguments?: unknown }).arguments
      }
      if (result && !result.running) {
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
  results: Map<string, ToolResultInfo>,
  omitToolCallIds?: ReadonlySet<string>
): Turn | null {
  if (msg.role !== 'user' && msg.role !== 'assistant') return null
  const blocks: OpenClawContentBlock[] = Array.isArray(msg.content)
    ? msg.content
    : typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : []
  const parts = blocks
    .map(b => blockToPart(b, msg.role, results, omitToolCallIds))
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
  const events: StreamEvent[] = []
  // Cold-path twin of the live model-change notice in session.ts: an
  // assistant row on a different model than the previous assistant row marks
  // a mid-session switch (sessions.patch from moi's picker or any other
  // client) — interleave a notice before that turn instead of letting the
  // switch pass silently. `prev` tracks every assistant row's model, even
  // ones that render no turn.
  let prevModel: string | undefined
  detail.messages.forEach((msg, i) => {
    if (msg.role === 'assistant') {
      const model = (msg as { model?: unknown }).model
      if (typeof model === 'string') {
        if (prevModel !== undefined && prevModel !== model) {
          events.push({
            kind: 'notice',
            notice: {
              id: `openclaw:model-change:${msg.__openclaw?.id ?? i}`,
              kind: 'model-change',
              at:
                typeof msg.timestamp === 'number'
                  ? new Date(msg.timestamp).toISOString()
                  : new Date().toISOString(),
              model,
              prev: prevModel
            }
          })
        }
        prevModel = model
      }
    }
    const turn = messageToTurn(msg, sessionKey, i, results)
    if (turn) events.push({ kind: 'turn', turn })
  })
  return events
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
