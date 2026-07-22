// The moi context envelope: ambient workspace state that rides along with
// every user message so the agent knows it is running inside a moi workspace
// and what the user is looking at. Everything about the envelope lives here —
// the structured `MoiContext` form, the rendered `<moi-context>` text, the
// per-harness injection transforms, and the strip used to keep the envelope
// out of chat bubbles.
//
// Flow: a structured `MoiContext` is assembled at send time — by the client
// for chat sends (client/features/workspace/moi-context.ts, sent as the chat
// frame's `context`), by the server for view-builder requests — and travels
// structured all the way to the harness, which renders it with the transform
// matching its conventions:
//   - Claude Code  — `moiContextSystemReminder` as its own leading text block
//     (mirrors how Claude Code itself injects ambient context; a string
//     prefix would defeat the SDK's first-prompt extraction, which skips
//     tag-leading text)
//   - Codex — native `turn/start.additionalContext` (`renderMoiContextBody`,
//     the entry key becomes the tag) on servers >= 0.135; `appendMoiContext`
//     fallback below that
//   - OpenClaw — `appendMoiContext` after the user's text
// Display paths strip with `stripMoiContext` so the envelope never surfaces
// in a bubble, live or replayed from a transcript.
import type { WorkspaceTabId } from './types'

const MOI_CONTEXT_OPEN = '<moi-context>'
const MOI_CONTEXT_CLOSE = '</moi-context>'
// Start of the first line inside the tag. Doubles as the strip guard: a user
// literally typing `<moi-context>` in their message won't have their text
// eaten. Keep this phrase byte-stable when rewording the envelope.
const MOI_CONTEXT_MARKER = 'You are running in a `moi` workspace'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'

// An applet-fired action riding a chat message (`sendAction` — see
// docs/intents.md). The visible message text is the action's label; the
// structured payload lives here, never in the text.
export type MoiIntent = {
  // The applet the action originated from, e.g. `view:shop` or `widget:orders`.
  source: string
  // Structured state the applet attached (the selected row, current filters, …).
  context?: Record<string, unknown>
}

// The structured form built at send time — by the client for chat sends, by
// the server for programmatic sends (the view builder). Extend this (and
// `renderMoiContext`) when new ambient fields land.
export type MoiContext = {
  // The workspace tab the user is on when they hit send — for a view-builder
  // request that's the builder's own tab (`view-builder:<id>`).
  activeTab: WorkspaceTabId
  // UI label of the active tab when it differs from the id — a view's
  // configured title (e.g. "Grading review" for `view:color-studio`), or a
  // view builder's claimed title while the build runs. The tab bar falls
  // back to the id when unset; so does the envelope.
  tabTitle?: string
  // Current param values of the active view tab (set by the last focus
  // intent), so the agent knows exactly what the user is looking at when
  // they say "make this cheaper".
  tabParams?: Record<string, unknown>
  // Set when this message was fired by an applet action instead of typed.
  intent?: MoiIntent
  // One-shot imperative lines for this message only (e.g. the view-builder
  // bootstrap instructions from lib/view-builder-directives.ts).
  directives?: string[]
}

// One sentence per tab, using the labels the user sees in the tab bar (except
// view-builder tabs, which print the builder id — that's what `moi builder
// set` needs). A view tab also names its backing file: the user speaks in
// titles ("fix the Grading review page") while the agent edits
// `.moi/views/<id>.tsx` — this line connects the two.
function describeTab(tab: WorkspaceTabId, title?: string): string {
  if (tab === 'agent') return 'The user is on the "Agent" tab (full page chat).'
  if (tab === 'widgets') return 'The user is on the "Widgets" tab.'
  if (tab === 'scratchpad') return 'The user is on the "Scratchpad" tab.'
  if (tab.startsWith('view-builder:')) {
    const id = tab.slice('view-builder:'.length)
    return title
      ? `The user is building a new view "${title}". Builder id "${id}".`
      : `The user is building a new view. Builder id "${id}".`
  }
  if (tab.startsWith('view:')) {
    const id = tab.slice('view:'.length)
    return `The user is on the "${title ?? id}" view tab (.moi/views/${id}.tsx).`
  }
  return `The user is on the "${tab}" tab.`
}

// A compact fenced JSON block for structured envelope payloads (view params,
// applet action context). Single-line — these objects are meant to stay small.
function fencedJson(value: Record<string, unknown>): string {
  return '```json\n' + JSON.stringify(value) + '\n```'
}

// Format (modeled on Claude Code's system-reminder context blocks): a short
// orientation preamble with the skill pointer, `# Section` headers with
// complete sentences under them, and an IMPORTANT footer with handling rules.
// The body renderer exists for transports that supply their own tag — Codex
// `additionalContext` renders the entry key as the tag, so shipping the
// wrapped text would double-wrap it.
export function renderMoiContextBody(ctx: MoiContext): string {
  const preamble = [
    `${MOI_CONTEXT_MARKER} — a shared UI the user chats with you from, which you can extend and customize.`,
    'Read the **`moi-workspace` skill** before responding — even to a simple question — unless you already read it in this chat.'
  ].join('\n')
  const activeTabLines = [describeTab(ctx.activeTab, ctx.tabTitle)]
  if (ctx.tabParams && Object.keys(ctx.tabParams).length > 0) {
    activeTabLines.push('The view currently shows these param values:', fencedJson(ctx.tabParams))
  }
  const sections = [`# Active tab\n${activeTabLines.join('\n')}`]
  if (ctx.intent) {
    const intentLines = [
      `The user fired this message with an action in "${ctx.intent.source}" — the message text is the action's label, not typed by the user.`
    ]
    if (ctx.intent.context && Object.keys(ctx.intent.context).length > 0) {
      intentLines.push('The applet attached this context:', fencedJson(ctx.intent.context))
    }
    sections.push(`# Applet action\n${intentLines.join('\n')}`)
  }
  if (ctx.directives?.length) {
    sections.push(`# This message only\n${ctx.directives.join('\n')}`)
  }
  const footer = [
    'IMPORTANT: This context comes from moi, not from the user, and the user does not see it.',
    'Only the newest of these blocks is current. Do not respond to it directly, and omit it from summaries and compaction.'
  ].join('\n')
  return [preamble, ...sections, footer].join('\n\n')
}

export function renderMoiContext(ctx: MoiContext): string {
  return `${MOI_CONTEXT_OPEN}\n${renderMoiContextBody(ctx)}\n${MOI_CONTEXT_CLOSE}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Wire-shape guard for the chat frame's `context` field (see web.ts).
export function isMoiContext(value: unknown): value is MoiContext {
  if (!isRecord(value)) return false
  const v = value as {
    activeTab?: unknown
    tabTitle?: unknown
    tabParams?: unknown
    intent?: unknown
    directives?: unknown
  }
  const intentOk =
    v.intent === undefined ||
    (isRecord(v.intent) &&
      typeof v.intent.source === 'string' &&
      (v.intent.context === undefined || isRecord(v.intent.context)))
  return (
    typeof v.activeTab === 'string' &&
    (v.tabTitle === undefined || typeof v.tabTitle === 'string') &&
    (v.tabParams === undefined || isRecord(v.tabParams)) &&
    intentOk &&
    (v.directives === undefined ||
      (Array.isArray(v.directives) && v.directives.every(d => typeof d === 'string')))
  )
}

// Claude Code: the envelope rides as its OWN text block wrapped in
// `<system-reminder>`, placed before the user's text block. Keeping it out of
// the user's string matters: the SDK's first-prompt extraction (session
// titles, home-card previews) skips text starting with a tag, so a prefixed
// string would make every moi message invisible to it.
export function moiContextSystemReminder(contextText: string): string {
  return `${SYSTEM_REMINDER_OPEN}\n${contextText}\n${SYSTEM_REMINDER_CLOSE}`
}

// Text-only harnesses (OpenClaw; Codex fallback): the envelope is appended
// after the user's text.
export function appendMoiContext(text: string, contextText: string): string {
  return text ? `${text}\n\n${contextText}` : contextText
}

// Remove the envelope (and, for Claude Code transcripts, its enclosing
// system-reminder wrapper) from user-message text before display. Repeats
// until no marker-bearing envelope remains, so a user pasting a full envelope
// into their message can't shield the injected one from stripping.
export function stripMoiContext(text: string): string {
  let out = text
  for (;;) {
    const next = stripOneMoiContext(out)
    if (next === out) return out
    out = next
  }
}

function stripOneMoiContext(text: string): string {
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

// For truncated snippets (session-list / home-card previews): like
// `stripMoiContext`, but also cuts an envelope (or its system-reminder
// wrapper) left unterminated by mid-envelope truncation. Skips the marker
// guard — cutting a preview short on a user-typed literal tag is harmless,
// unlike eating chat-bubble text.
export function stripMoiContextLoose(text: string): string {
  let stripped = stripMoiContext(text)
  const open = stripped.indexOf(MOI_CONTEXT_OPEN)
  if (open !== -1) stripped = stripped.slice(0, open)
  const reminder = stripped.indexOf(SYSTEM_REMINDER_OPEN)
  if (reminder !== -1) stripped = stripped.slice(0, reminder)
  return stripped.trimEnd()
}
