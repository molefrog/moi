// ACP wire (layer 1) → moi display format (layer 2). Pure mapping, no I/O.
//
// ACP streams *chunks*, not discrete messages: assistant text and thinking
// arrive token-by-token with no message boundary, and tool calls interleave.
// The shape moi renders is turn-based, so this module owns the accumulation
// rule: consecutive text/thought chunks build one assistant turn, and a tool
// call both closes the open assistant turn and becomes a turn of its own —
// the same item-per-turn model the Codex adapter produces.

import { splitAttachmentNote } from '@/lib/attachment-note'
import type { Part, ToolCall, ToolState, Turn, TurnMeta } from '@/lib/format'
import { stripMoiContext } from '@/lib/moi-context'

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

  const text = toolContentToText(update.content)
  const locations = update.locations?.map(l => l.path).filter(Boolean) ?? []
  const call: ToolCall = {
    toolCallId: update.toolCallId,
    name: toolCallName(update, prevCall?.name),
    caller: 'model',
    provider,
    state: update.status ? toolStatusToState(update.status) : (prevCall?.state ?? 'running'),
    input: update.rawInput ?? prevCall?.input ?? (locations.length ? { path: locations[0] } : {}),
    ...(locations.length
      ? { sidecar: { locations } }
      : prevCall?.sidecar
        ? { sidecar: prevCall.sidecar }
        : {})
  }
  // `tool_call` announces with a preview blurb and `tool_call_update` carries
  // the result; keep whichever text we have most recently seen.
  const output = text || (typeof prevCall?.output === 'string' ? prevCall.output : '')
  if (output) call.output = output
  if (call.state === 'error' && output) call.errorText = output

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
  const { inputTokens, outputTokens, totalTokens } = usage
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  return { inputTokens, outputTokens, totalTokens }
}

// Replayed `user_message_chunk` text is the persisted prompt verbatim: the
// typed text plus everything the sender appended to it — the attachment note
// and the `<moi-context>` envelope (see sendAcpMessage in ./session.ts). Fold
// that machinery back out so a reloaded bubble matches the live one. Envelope
// first: it is appended after the note, and `splitAttachmentNote` parses the
// note as the text's tail. An envelope-only block (an attachment-only send
// carries the envelope as its lone text) folds to no parts — the caller skips
// the bubble entirely.
export function replayedUserParts(raw: string): Part[] {
  const split = splitAttachmentNote(stripMoiContext(raw))
  const parts: Part[] = split.files.map(f => ({
    type: 'file',
    mediaType: 'application/octet-stream',
    url: f.path,
    filename: f.filename
  }))
  if (split.text.trim()) parts.push({ type: 'text', text: split.text })
  return parts
}

export function acpSessionToSessionInfo(entry: AcpSessionListEntry): SessionInfo {
  const updated = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN
  return {
    sessionId: entry.sessionId,
    summary: entry.title?.trim() || 'Untitled session',
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

  // Abandon the open run without emitting (used when a replay pass restarts).
  reset() {
    this.text = ''
    this.reasoning = ''
    this.startedAt = null
    this.runIndex = 0
  }
}
