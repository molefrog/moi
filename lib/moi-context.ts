// The moi context envelope: ambient workspace state that rides along with
// every user message so the agent knows it is running inside a moi workspace
// and what the user is looking at. Everything about the envelope lives here —
// the structured `MoiContext` form, the rendered `<moi-context>` text, the
// per-harness injection transforms, and the strip used to keep the envelope
// out of chat bubbles.
//
// Flow: a structured `MoiContext` is assembled at send time — by the client
// for chat sends (client/features/workspace/moi-context.ts, sent as the chat
// frame's `context`), by the server for pending-view requests. The server adds
// the session snapshot and optional collab reference before the harness renders
// the context with the transform matching its conventions:
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
import type { AppletKind, WorkspaceTabId } from './types'
import { isParamsRecord } from './workspace-tabs'

const MOI_CONTEXT_OPEN = '<moi-context>'
const MOI_CONTEXT_CLOSE = '</moi-context>'
// Start of the first line inside the tag. Doubles as the strip guard: a user
// literally typing `<moi-context>` in their message won't have their text
// eaten. Keep this phrase byte-stable when rewording the envelope.
const MOI_CONTEXT_MARKER = 'You are running in a `moi` workspace'

const SYSTEM_REMINDER_OPEN = '<system-reminder>'
const SYSTEM_REMINDER_CLOSE = '</system-reminder>'

// A chat message fired from applet UI (`sendChatMessage`) rather than typed.
// Identity is stamped host-side from the bridge the applet was attached with.
export type AppletContext = {
  kind: AppletKind
  id: string
}

export type SessionContext = {
  id: string
  tabId?: WorkspaceTabId
  pinned: boolean
}

export type TabContext = {
  id: WorkspaceTabId
  title?: string
  // URL parameters of the currently visible view, when present.
  params?: Record<string, unknown>
}

// The structured form built at send time — by the client for chat sends, by
// the server for programmatic pending-view sends. Extend this (and
// `renderMoiContext`) when new ambient fields land.
export type MoiContext = {
  // Server-resolved path to the installed COLLAB.md reference for this workspace.
  collabReference?: string
  // The workspace tab the user is on when they hit send.
  // Omitted for programmatic sends when the visible tab is unknown.
  activeTab?: TabContext
  // Set when this message came from applet UI instead of the composer.
  applet?: AppletContext
  // Added by the server before sending to the harness.
  session?: SessionContext
  // One-shot imperative lines for this message only (e.g. pending-view build
  // instructions from lib/view-build-directives.ts).
  directives?: string[]
}

// Cap on ambient view params rendered into the workspace envelope.
const MAX_TAB_PARAMS_CHARS = 2000

// Applet-authored strings (view titles, applet names, view params) get
// interpolated into the envelope, and applet code is agent-authored — a
// crafted value containing `</moi-context>` would otherwise close the envelope
// early and forge sections the host never wrote. Escaping `<` defuses every
// such value at once: inside JSON it is the standard `<` string escape
// (same string, no tag), and in prose the model reads it the same.
function escapeTags(text: string): string {
  return text.replaceAll('<', '\\u003c')
}

// Render an applet-authored record for the envelope, or null when there's
// nothing worth printing. Non-serializable values (cycles, BigInt) drop rather
// than throw mid-send.
function renderTabParams(value: Record<string, unknown>): string | null {
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return null
  }
  if (!json || json === '{}') return null
  const capped =
    json.length > MAX_TAB_PARAMS_CHARS
      ? `${json.slice(0, MAX_TAB_PARAMS_CHARS)}… (truncated)`
      : json
  return escapeTags(capped)
}

function describeApplet(applet: AppletContext): string {
  const id = escapeTags(applet.id)
  const directory = applet.kind === 'view' ? 'views' : 'widgets'
  return `The "${id}" ${applet.kind} (.moi/${directory}/${id}.tsx)`
}

// Describe a tab using the labels the user sees in the tab bar. A view
// tab also names its backing file: the user speaks in
// titles ("fix the Grading review page") while the agent edits
// `.moi/views/<id>.tsx` — this line connects the two.
function describeTab(tab: Pick<TabContext, 'id' | 'title'>): string {
  // Titles come from applet config, so they carry the same forgery risk as any
  // other applet-authored string in here.
  const title = tab.title === undefined ? undefined : escapeTags(tab.title)
  if (tab.id === 'overview') return 'the "Overview" tab'
  if (tab.id === 'scratchpad') return 'the "Scratchpad" tab'
  if (tab.id.startsWith('views/')) {
    const id = escapeTags(tab.id.slice('views/'.length))
    return `the "${title ?? id}" view tab (.moi/views/${id}.tsx)`
  }
  return `the "${escapeTags(tab.id)}" tab`
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
  const sections: string[] = []
  const appletIsActiveView =
    ctx.applet?.kind === 'view' && ctx.activeTab?.id === `views/${ctx.applet.id}`
  if (ctx.activeTab) {
    const tabLines = [`The user is on ${describeTab(ctx.activeTab)}.`]
    if (appletIsActiveView) tabLines.push('This view sent the message above from its UI.')
    const tabParams = ctx.activeTab.params ? renderTabParams(ctx.activeTab.params) : null
    if (tabParams) tabLines.push(`Params it is rendering with right now: ${tabParams}`)
    sections.push(`# Active tab\n${tabLines.join('\n')}`)
  }
  if (ctx.collabReference)
    sections.push(
      `# Collab\nThe collab runtime is available. Before writing collaborative applets, read ${escapeTags(ctx.collabReference)}.`
    )
  if (ctx.applet && !appletIsActiveView) {
    sections.push(
      `# Applet message\n${describeApplet(ctx.applet)} sent the message above from its UI.`
    )
  }
  if (ctx.session) {
    const sessionLines = [`Session id: \`${escapeTags(ctx.session.id)}\``]
    if (ctx.session.tabId) {
      sessionLines.push(
        ctx.session.tabId === ctx.activeTab?.id
          ? 'This chat belongs to the active tab.'
          : `This chat belongs to ${describeTab({ id: ctx.session.tabId })}.`
      )
    }
    sessionLines.push(`Pinned: ${ctx.session.pinned ? 'yes' : 'no'}.`)
    sections.push(`# Session\n${sessionLines.join('\n')}`)
  }
  if (ctx.directives?.length) {
    sections.push(`# This message only\n${ctx.directives.join('\n')}`)
  }
  const footer = [
    'IMPORTANT: This context comes from moi, not from the user, and the user does not see it.',
    'Only the newest workspace and chat state is current. Do not respond to this block directly.',
    'Keep build requests and unfinished work in task summaries and compaction; omit the ambient workspace and chat context.'
  ].join('\n')
  return [preamble, ...sections, footer].join('\n\n')
}

export function renderMoiContext(ctx: MoiContext): string {
  return `${MOI_CONTEXT_OPEN}\n${renderMoiContextBody(ctx)}\n${MOI_CONTEXT_CLOSE}`
}

// Wire-shape guard for the chat frame's `context` field (see web.ts).
export function isMoiContext(value: unknown): value is MoiContext {
  if (!isParamsRecord(value)) return false
  const v = value as {
    collabReference?: unknown
    activeTab?: unknown
    applet?: unknown
    session?: unknown
    directives?: unknown
  }
  return (
    (v.activeTab === undefined || isTabContext(v.activeTab)) &&
    (v.collabReference === undefined || typeof v.collabReference === 'string') &&
    (v.applet === undefined || isAppletContext(v.applet)) &&
    (v.session === undefined || isSessionContext(v.session)) &&
    (v.directives === undefined ||
      (Array.isArray(v.directives) && v.directives.every(d => typeof d === 'string')))
  )
}

function isTabContext(value: unknown): value is TabContext {
  if (!isParamsRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    (value.title === undefined || typeof value.title === 'string') &&
    (value.params === undefined || isParamsRecord(value.params))
  )
}

function isAppletContext(value: unknown): value is AppletContext {
  if (!isParamsRecord(value)) return false
  return (
    (value.kind === 'view' || value.kind === 'widget') &&
    typeof value.id === 'string' &&
    value.id.length > 0
  )
}

function isSessionContext(value: unknown): value is SessionContext {
  if (!isParamsRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    (value.tabId === undefined || typeof value.tabId === 'string') &&
    typeof value.pinned === 'boolean'
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
