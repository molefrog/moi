// ACP wire (layer 1) → moi display format (layer 2). Pure mapping, no I/O.
//
// ACP streams *chunks*, not discrete messages: assistant text and thinking
// arrive token-by-token with no message boundary, and tool calls interleave.
// The shape moi renders is turn-based, so this module owns the accumulation
// rule: consecutive text/thought chunks build one assistant turn, and a tool
// call both closes the open assistant turn and becomes a turn of its own —
// the same item-per-turn model the Codex adapter produces.

import { replayAttachmentParts } from '@/lib/moi-attachments'
import { formatChatTitle } from '@/lib/chat-title'
import type { Part, ToolCall, ToolState, Turn, TurnMeta } from '@/lib/format'

import {
  type AcpSessionListEntry,
  type ToolCallStatus,
  type ToolCallUpdate,
  type Usage,
  toolContentToText
} from './wire'
import type { SessionInfo } from '@/lib/types'

export type AcpProviderId = NonNullable<ToolCall['provider']>

export function toolStatusToState(status: ToolCallStatus | undefined): ToolState {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'in_progress':
      return 'running'
    default:
      // ACP defaults an omitted status to `pending`; moi renders that as a
      // spinner-less card, so treat a started call as running instead.
      return 'running'
  }
}

// Tool-call turn ids must be stable across the `tool_call` → `tool_call_update`
// pair (upsert-by-id) and across live-vs-replay, where the backend may hand out
// different ids for the same call (Hermes does — see ../hermes/NOTES.md §3.4).
export function toolTurnId(sessionId: string, toolCallId: string): string {
  return `${sessionId}:tool:${toolCallId}`
}

export function assistantTurnId(sessionId: string, runIndex: number): string {
  return `${sessionId}:msg:${runIndex}`
}

// ACP tool calls carry a semantic `kind` and a human `title` instead of a raw
// function name. Prefer the title (it is already display-ready, e.g.
// "terminal: echo hi"); only the opening `tool_call` carries one, so the name
// already on the card outranks the bare `kind` a `tool_call_update` falls back
// to — otherwise the label degrades from "terminal: echo hi" to "execute"
// the moment the call completes.
export function toolCallName(update: ToolCallUpdate, previousName?: string): string {
  return update.title?.trim() || previousName || update.kind || 'tool'
}

export function acpToolCallToTurn(input: {
  update: ToolCallUpdate
  sessionId: string
  provider: AcpProviderId
  previous?: Turn
  timestamp?: string
}): Turn {
  const { update, sessionId, provider, previous } = input
  const prevCall =
    previous?.parts.find((p): p is Extract<Part, { type: 'tool-call' }> => p.type === 'tool-call')
      ?.call ?? undefined

  const sidecar = { ...prevCall?.sidecar }
  // ACP updates are patches: absent fields preserve the previous value, but
  // supplied collections replace it (including an empty array). Keep the
  // structured content as well as its readable preview so diffs and non-text
  // results survive subsequent status-only updates.
  if (update.content != null) sidecar.content = update.content
  if (update.locations != null) sidecar.locations = update.locations.map(l => l.path)
  if (update.rawOutput !== undefined) sidecar.rawOutput = update.rawOutput
  if (update.name != null) sidecar.name = update.name
  if (update.kind != null) sidecar.kind = update.kind
  const locations = update.locations?.map(l => l.path).filter(Boolean) ?? []
  const call: ToolCall = {
    toolCallId: update.toolCallId,
    name: toolCallName(update, prevCall?.name),
    caller: 'model',
    provider,
    state: update.status ? toolStatusToState(update.status) : (prevCall?.state ?? 'running'),
    input:
      update.rawInput !== undefined
        ? update.rawInput
        : prevCall
          ? prevCall.input
          : locations.length
            ? { path: locations[0] }
            : {},
    ...(Object.keys(sidecar).length ? { sidecar } : {})
  }
  // Visible content takes precedence over raw output. An explicit content
  // clear is still a value; never revive the previous preview or raw result.
  const output =
    update.content != null
      ? toolContentToText(update.content)
      : 'content' in sidecar
        ? prevCall?.output
        : 'rawOutput' in sidecar
          ? sidecar.rawOutput
          : prevCall?.output
  if (output !== undefined) call.output = output
  if (call.state === 'error' && typeof output === 'string' && output) call.errorText = output

  return {
    id: toolTurnId(sessionId, update.toolCallId),
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts: [{ type: 'tool-call', call }],
    timestamp: previous?.timestamp ?? input.timestamp ?? new Date().toISOString()
  }
}

export function acpUsageToTurnMeta(usage: Usage | null | undefined): TurnMeta['usage'] | undefined {
  if (!usage) return undefined
  const { inputTokens, outputTokens } = usage
  // ACP requires `totalTokens`, but fx 0.0.11 omits it.
  const totalTokens =
    usage.totalTokens ??
    (typeof inputTokens === 'number' && typeof outputTokens === 'number'
      ? inputTokens + outputTokens
      : undefined)
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  return { inputTokens, outputTokens, totalTokens }
}

// Marks a run the user stopped, live and when a reload replays it.
export const STOPPED_NOTICE = 'This run was stopped before it finished.'

// Replay collects text and image chunks before reconstructing attachments,
// so inline images can be paired with their descriptions in message order.
// Agents such as fx store a `[Image #1]` line per inline image; the image
// itself is replayed as its own part, so the marker line is dropped.
export function replayedUserParts(raw: string, images: readonly Part[] = []): Part[] {
  const text = images.length ? raw.replace(/\n*^\[Image #\d+\][ \t]*$/gm, '').trimEnd() : raw
  return replayAttachmentParts([...images, { type: 'text', text }])
}

// `firstMessage` titles a chat the agent has not named yet, the way the client
// titles it optimistically, instead of a generic placeholder.
export function acpSessionToSessionInfo(
  entry: AcpSessionListEntry,
  firstMessage?: string
): SessionInfo {
  const updated = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN
  return {
    sessionId: entry.sessionId,
    summary:
      formatChatTitle(entry.title?.trim() ?? '') ||
      formatChatTitle(firstMessage ?? '') ||
      'Untitled session',
    lastModified: Number.isNaN(updated) ? 0 : updated,
    ...(entry.cwd ? { cwd: entry.cwd } : {})
  }
}

// Accumulates chunk streams into assistant turns. One instance per live
// session (and one per replay pass) — see the module header for the rule.
export class AssistantTurnAccumulator {
  private text = ''
  private reasoning = ''
  private runIndex = 0
  private startedAt: string | null = null

  constructor(
    private sessionId: string,
    private model?: string,
    private provider?: string
  ) {}

  setModel(model: string | undefined) {
    this.model = model
  }

  get isOpen(): boolean {
    return this.text.length > 0 || this.reasoning.length > 0
  }

  // The id the open run will be emitted under. Also used as the preview's
  // `apiMessageId`, so the client clears the preview when the turn lands.
  get currentId(): string {
    return assistantTurnId(this.sessionId, this.runIndex)
  }

  append(kind: 'text' | 'reasoning', delta: string) {
    if (!delta) return
    if (!this.startedAt) this.startedAt = new Date().toISOString()
    if (kind === 'text') this.text += delta
    else this.reasoning += delta
  }

  // Snapshot of the open run as preview blocks (cumulative text, never diffs).
  previewBlocks(): { index: number; kind: 'text' | 'reasoning'; text: string }[] {
    const blocks: { index: number; kind: 'text' | 'reasoning'; text: string }[] = []
    if (this.reasoning)
      blocks.push({ index: blocks.length, kind: 'reasoning', text: this.reasoning })
    if (this.text) blocks.push({ index: blocks.length, kind: 'text', text: this.text })
    return blocks
  }

  // Close the open run and return its Turn, or null when nothing accumulated.
  // `meta` is folded in so the final turn of a prompt carries usage/stopReason.
  flush(meta?: TurnMeta): Turn | null {
    if (!this.isOpen) return null
    const parts: Part[] = []
    if (this.reasoning) parts.push({ type: 'reasoning', text: this.reasoning })
    if (this.text) parts.push({ type: 'text', text: this.text })
    const turn: Turn = {
      id: this.currentId,
      role: 'assistant',
      origin: { kind: 'user-input' },
      parts,
      timestamp: this.startedAt ?? new Date().toISOString(),
      meta: {
        ...(this.model ? { model: this.model } : {}),
        ...(this.provider ? { provider: this.provider } : {}),
        apiMessageId: this.currentId,
        ...meta
      }
    }
    this.text = ''
    this.reasoning = ''
    this.startedAt = null
    this.runIndex++
    return turn
  }

  // Continue numbering after runs already in a transcript this accumulator did
  // not build (a retained live view), so new runs never reuse their ids.
  continueAfter(turns: readonly Turn[]) {
    const prefix = `${this.sessionId}:msg:`
    for (const turn of turns) {
      if (!turn.id.startsWith(prefix)) continue
      const index = Number(turn.id.slice(prefix.length))
      if (Number.isInteger(index) && index >= this.runIndex) this.runIndex = index + 1
    }
  }

  // Abandon the open run without emitting (used when a replay pass restarts).
  reset() {
    this.text = ''
    this.reasoning = ''
    this.startedAt = null
    this.runIndex = 0
  }
}
