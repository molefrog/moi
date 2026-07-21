// The moi context envelope: ambient workspace state that rides along with
// every user message so the agent knows it is running inside a moi workspace
// and what the user is looking at. Everything about the envelope lives here —
// the structured form the client builds, the rendered `<moi-context>` text,
// the per-harness injection transforms, and the strip used to keep the
// envelope out of chat bubbles.
//
// Flow: the client builds `MoiContext` at send time, renders it with
// `renderMoiContext`, and sends the text on the chat frame (`context`). Each
// harness injects it into the outgoing message with the transform matching
// its conventions:
//   - Claude Code  — `wrapMoiContextSystemReminder` + prepended to the text
//     (mirrors how Claude Code itself injects ambient context)
//   - Codex — native `turn/start.additionalContext` (`unwrapMoiContext` body,
//     the entry key becomes the tag) on servers >= 0.135; `appendMoiContext`
//     fallback below that
//   - OpenClaw — `appendMoiContext` after the user's text
// Display paths strip with `stripMoiContext` so the envelope never surfaces
// in a bubble, live or replayed from a transcript.
import type { WorkspaceTabId } from './types'

const MOI_CONTEXT_OPEN = '<moi-context>'
const MOI_CONTEXT_CLOSE = '</moi-context>'
// First line inside the tag. Doubles as the strip guard: a user literally
// typing `<moi-context>` in their message won't have their text eaten.
const MOI_CONTEXT_MARKER = 'moi workspace context'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'

// The structured form the client builds at send time. Extend this (and
// `renderMoiContext`) when new ambient fields or one-shot directives land.
export type MoiContext = {
  // The workspace tab the user is on when they hit send.
  activeTab: WorkspaceTabId
}

function describeTab(tab: WorkspaceTabId): string {
  if (tab === 'agent') return 'chat'
  if (tab === 'widgets') return 'widgets (dashboard)'
  if (tab === 'scratchpad') return 'scratchpad'
  if (tab.startsWith('view-builder:')) return `view builder "${tab.slice('view-builder:'.length)}"`
  if (tab.startsWith('view:')) return `view "${tab.slice('view:'.length)}"`
  return tab
}

export function renderMoiContext(ctx: MoiContext): string {
  return [
    MOI_CONTEXT_OPEN,
    `${MOI_CONTEXT_MARKER} — snapshot at send time, not shown in the user's chat.`,
    'Ephemeral: only the newest of these blocks is current — disregard older ones, and omit them entirely when summarizing or compacting this conversation.',
    'This message was sent from a moi workspace. If you have not read the moi-workspace skill in this chat yet, read it before taking any action.',
    `The user is on: ${describeTab(ctx.activeTab)}`,
    MOI_CONTEXT_CLOSE
  ].join('\n')
}

// Claude Code: the envelope arrives wrapped in a `<system-reminder>` block
// prepended before the user's text.
export function wrapMoiContextSystemReminder(text: string, contextText: string): string {
  return `${SYSTEM_REMINDER_OPEN}\n${contextText}\n${SYSTEM_REMINDER_CLOSE}\n\n${text}`
}

// Text-only harnesses (OpenClaw; Codex fallback): the envelope is appended
// after the user's text, same placement as the view-builder meta block.
export function appendMoiContext(text: string, contextText: string): string {
  return text ? `${text}\n\n${contextText}` : contextText
}

// The envelope body without the wrapper tag, for transports that supply their
// own tag — Codex `turn/start.additionalContext` renders the entry key as the
// tag, so shipping the wrapped text would double-wrap it.
export function unwrapMoiContext(contextText: string): string {
  const t = contextText.trim()
  if (t.startsWith(MOI_CONTEXT_OPEN) && t.endsWith(MOI_CONTEXT_CLOSE)) {
    return t.slice(MOI_CONTEXT_OPEN.length, -MOI_CONTEXT_CLOSE.length).trim()
  }
  return t
}

// Remove the envelope (and, for Claude Code transcripts, its enclosing
// system-reminder wrapper) from user-message text before display.
export function stripMoiContext(text: string): string {
  const start = text.indexOf(MOI_CONTEXT_OPEN)
  if (start === -1) return text
  const end = text.indexOf(MOI_CONTEXT_CLOSE, start)
  if (end === -1) return text
  if (!text.slice(start, end).includes(MOI_CONTEXT_MARKER)) return text
  let before = text.slice(0, start)
  let after = text.slice(end + MOI_CONTEXT_CLOSE.length)
  if (
    before.trimEnd().endsWith(SYSTEM_REMINDER_OPEN) &&
    after.trimStart().startsWith(SYSTEM_REMINDER_CLOSE)
  ) {
    before = before.trimEnd().slice(0, -SYSTEM_REMINDER_OPEN.length)
    after = after.trimStart().slice(SYSTEM_REMINDER_CLOSE.length)
  }
  return `${before.trim()}\n\n${after.trim()}`.trim()
}
