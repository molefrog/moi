// Map Codex app-server shapes into our agent-agnostic display format.
//
// Codex emits semantic ThreadItems (a command, a patch, an MCP call) with
// their own lifecycle (`item/started` → `item/completed`), not raw
// tool_use/tool_result pairs. Each item becomes one Turn: `userMessage` a
// user turn, everything else an assistant turn; tool-shaped items carry a
// single `tool-call` part whose state tracks the item's `status`.
//
// Type shapes are hand-written against `codex app-server generate-ts`
// (CLI 0.144.5) and read defensively — see ./NOTES.md.
import type {
  Part,
  StreamEvent,
  SubagentRecord,
  SystemNotice,
  ToolCall,
  ToolState,
  Turn
} from '@/lib/format'
import { stripMoiContext, stripMoiContextLoose } from '@/lib/moi-context'
import type { Model, SessionInfo } from '@/lib/types'

import type { WorkspaceActivityPreview } from '../types'

// ---- protocol shapes (subset we consume) ------------------------------------

export type CodexUserInput =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }

export type CodexThreadItem = {
  type: string
  id: string
  // userMessage
  clientId?: string | null
  content?: CodexUserInput[]
  // agentMessage / plan
  text?: string
  phase?: string | null
  // reasoning
  summary?: string[]
  // commandExecution
  command?: string
  cwd?: string
  status?: string
  aggregatedOutput?: string | null
  exitCode?: number | null
  durationMs?: number | null
  // Codex's own parse of what the command does (read/listFiles/search/
  // unknown) — one entry per piped command. Drives CC-style semantic labels.
  commandActions?: {
    type?: string
    command?: string
    name?: string
    path?: string
    query?: string | null
  }[]
  // fileChange
  changes?: { path: string; kind?: { type?: string }; diff?: string }[]
  // mcpToolCall
  server?: string
  tool?: string
  arguments?: unknown
  result?: { content?: unknown[]; structuredContent?: unknown } | null
  error?: { message?: string } | null
  // webSearch
  query?: string
  action?: { query?: string | null; queries?: (string | null)[] | null } | null
  // imageGeneration
  revisedPrompt?: string | null
  // collabAgentToolCall (tool reused from mcpToolCall above)
  prompt?: string | null
  senderThreadId?: string
  receiverThreadIds?: string[]
  // subAgentActivity
  kind?: string
  agentThreadId?: string
  agentPath?: string
}

export type CodexTurn = {
  id: string
  items: CodexThreadItem[]
  status: string
  error?: { message?: string; codexErrorInfo?: unknown } | null
  durationMs?: number | null
}

export type CodexThread = {
  id: string
  preview?: string
  cwd?: string
  createdAt?: number
  updatedAt?: number
  name?: string | null
  status?: { type?: string }
  turns?: CodexTurn[]
}

export type CodexTokenUsage = {
  total?: { totalTokens?: number; inputTokens?: number; outputTokens?: number }
  last?: { totalTokens?: number; inputTokens?: number; outputTokens?: number }
}

export type CodexModel = {
  id: string
  model: string
  displayName: string
  description?: string
  hidden?: boolean
  supportedReasoningEfforts?: { reasoningEffort: string; description?: string }[]
  defaultReasoningEffort?: string
  isDefault?: boolean
}

// ---- discovery mappings ------------------------------------------------------

// `thread/list.preview` snippets come from the raw first user message — on
// the pre-0.135 fallback path that text carries the appended context envelope,
// so previews strip it like transcript turns do. Loose variant: previews are
// truncated snippets, so a mid-envelope cut must still strip.
function cleanPreview(preview: string | undefined): string {
  return preview ? stripMoiContextLoose(preview).trim() : ''
}

export function codexThreadToSessionInfo(t: CodexThread): SessionInfo {
  return {
    sessionId: t.id,
    summary: t.name?.trim() || cleanPreview(t.preview),
    // Codex timestamps are unix seconds; SessionInfo wants millis.
    lastModified: (t.updatedAt ?? t.createdAt ?? 0) * 1000,
    cwd: t.cwd
  }
}

// Home-page card preview from thread/list alone: `preview` already carries the
// thread's first-message snippet, so no thread/read is needed. The oldest
// thread by creation supplies the message; the newest activity supplies the
// timestamp.
export function selectCodexWorkspacePreview(
  threads: CodexThread[],
  includeFirstUserMessage: boolean
): WorkspaceActivityPreview {
  const latest = threads.reduce<number | undefined>((acc, t) => {
    const ts = t.updatedAt ?? t.createdAt
    return ts !== undefined && (acc === undefined || ts > acc) ? ts : acc
  }, undefined)
  const updatedAt = latest !== undefined ? latest * 1000 : undefined

  let firstUserMessage: string | undefined
  if (includeFirstUserMessage) {
    const oldest = [...threads].sort(
      (a, b) =>
        (a.createdAt ?? a.updatedAt ?? 0) - (b.createdAt ?? b.updatedAt ?? 0) ||
        a.id.localeCompare(b.id)
    )[0]
    firstUserMessage = cleanPreview(oldest?.preview) || undefined
  }

  return {
    ...(firstUserMessage ? { firstUserMessage } : {}),
    ...(updatedAt !== undefined ? { updatedAt } : {})
  }
}

export function codexModelToModel(m: CodexModel): Model {
  const efforts = (m.supportedReasoningEfforts ?? []).map(e => e.reasoningEffort)
  const displayName = m.displayName.replace(/^GPT-/, '').replaceAll('-', ' ')
  return {
    value: m.id,
    resolvedModel: m.model,
    displayName,
    // Our Model.description is a " · "-joined "<headline> · <tagline>" blurb
    // (the picker renders the first segment as the row label), so lead with
    // the display name and let Codex's one-liner be the tagline.
    ...(m.description
      ? { description: `${displayName} · ${m.description}` }
      : { description: displayName }),
    supportsEffort: efforts.length > 0,
    ...(efforts.length > 0 ? { supportedEffortLevels: efforts } : {})
  }
}

// ---- item → turn -------------------------------------------------------------

function statusToToolState(status: string | undefined): ToolState {
  switch (status) {
    case 'inProgress':
      return 'running'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'declined':
      return 'approval-denied'
    default:
      return 'pending'
  }
}

function userInputToParts(content: CodexUserInput[] | undefined): Part[] {
  const parts: Part[] = []
  for (const c of content ?? []) {
    // The send path appends the `<moi-context>` envelope to the agent text;
    // the native echo and thread replays carry it back, so peel it here.
    if (c.type === 'text' && c.text) {
      const text = stripMoiContext(c.text)
      if (text) parts.push({ type: 'text', text })
    } else if (c.type === 'image' && c.url)
      parts.push({ type: 'file', mediaType: 'image/*', url: c.url })
    else if (c.type === 'localImage' && c.path)
      parts.push({ type: 'text', text: `[image: ${c.path}]` })
  }
  return parts
}

// Flatten an MCP result's content blocks into a readable string (same
// approach as the OpenClaw adapter — text blocks joined, others tagged).
function flattenMcpResult(result: CodexThreadItem['result']): string {
  if (!result) return ''
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return JSON.stringify(result.structuredContent, null, 2)
  }
  const blocks = Array.isArray(result.content) ? result.content : []
  return blocks
    .map(b => {
      if (b && typeof b === 'object' && (b as { type?: string }).type === 'text') {
        const t = (b as { text?: unknown }).text
        return typeof t === 'string' ? t : ''
      }
      return b && typeof b === 'object' ? `[${(b as { type?: string }).type ?? 'block'}]` : ''
    })
    .filter(Boolean)
    .join('\n')
}

function itemToToolCall(item: CodexThreadItem): ToolCall | null {
  switch (item.type) {
    case 'commandExecution': {
      const call: ToolCall = {
        toolCallId: item.id,
        name: 'exec',
        caller: 'model',
        provider: 'codex',
        state: statusToToolState(item.status),
        input: {
          command: item.command,
          cwd: item.cwd,
          ...(item.commandActions?.length ? { commandActions: item.commandActions } : {})
        }
      }
      if (item.aggregatedOutput) {
        if (call.state === 'error') call.errorText = item.aggregatedOutput
        else call.output = item.aggregatedOutput
      }
      if (typeof item.exitCode === 'number' || typeof item.durationMs === 'number') {
        call.sidecar = { exitCode: item.exitCode, durationMs: item.durationMs }
      }
      return call
    }
    case 'fileChange': {
      return {
        toolCallId: item.id,
        name: 'apply_patch',
        caller: 'model',
        provider: 'codex',
        state: statusToToolState(item.status),
        input: {
          changes: (item.changes ?? []).map(c => ({
            path: c.path,
            kind: c.kind?.type,
            diff: c.diff
          }))
        }
      }
    }
    case 'mcpToolCall': {
      const call: ToolCall = {
        toolCallId: item.id,
        name: item.tool ?? 'mcp',
        caller: 'model',
        provider: 'codex',
        mcpServer: item.server,
        state: statusToToolState(item.status),
        input: item.arguments
      }
      const output = flattenMcpResult(item.result)
      if (item.error?.message) {
        call.state = 'error'
        call.errorText = item.error.message
      } else if (output) {
        call.output = output
      }
      return call
    }
    case 'webSearch': {
      // A single item can fan out into several queries (`action.queries`).
      const queries = (item.action?.queries ?? []).filter(
        (q): q is string => typeof q === 'string' && q.length > 0
      )
      return {
        toolCallId: item.id,
        name: 'web_search',
        caller: 'model',
        provider: 'codex',
        // webSearch items have no lifecycle status; they appear when done.
        state: 'success',
        input: { query: item.query, ...(queries.length ? { queries } : {}) }
      }
    }
    case 'plan': {
      return {
        toolCallId: item.id,
        name: 'update_plan',
        caller: 'model',
        provider: 'codex',
        state: 'success',
        input: { plan: item.text }
      }
    }
    // Codex multi-agent: the parent's collab tool invocations (`spawn_agent`,
    // `send_input`, `resume_agent`, `wait`, `close_agent`). The child agent
    // runs as its OWN thread whose items stream on the same connection under
    // `agentThreadId`; its transcript nests into the `subAgentActivity` card
    // (see session.ts), so this card only narrates the parent's side.
    case 'collabAgentToolCall': {
      // `wait` is the parent idling on its children — protocol noise next to
      // the activity card that already shows the child running. Drop it.
      if (item.tool === 'wait') return null
      return {
        toolCallId: item.id,
        name: 'subagent',
        caller: 'subagent',
        provider: 'codex',
        state: statusToToolState(item.status),
        input: {
          action: item.tool,
          ...(item.prompt ? { prompt: item.prompt } : {}),
          ...(item.receiverThreadIds?.length ? { agents: item.receiverThreadIds } : {})
        }
      }
    }
    case 'subAgentActivity': {
      // The card that carries the child agent's nested transcript: the
      // session layer correlates the child thread (`agentThreadId`) and
      // attaches a SubagentRecord to this call (see session.ts).
      return {
        toolCallId: item.id,
        name: 'subagent_activity',
        caller: 'subagent',
        provider: 'codex',
        state: 'success',
        input: { kind: item.kind, agentThreadId: item.agentThreadId, agentPath: item.agentPath }
      }
    }
    case 'enteredReviewMode':
    case 'exitedReviewMode': {
      return {
        toolCallId: item.id,
        name: 'review',
        caller: 'model',
        provider: 'codex',
        state: 'success',
        input: {
          phase: item.type === 'enteredReviewMode' ? 'entered' : 'exited',
          review: item.text ?? (item as { review?: string }).review
        }
      }
    }
    case 'imageView': {
      return {
        toolCallId: item.id,
        name: 'view_image',
        caller: 'model',
        provider: 'codex',
        state: 'success',
        input: { path: (item as { path?: string }).path }
      }
    }
    case 'imageGeneration': {
      // `revisedPrompt` is the model's final prompt; the item also carries
      // `result` — the ENTIRE generated image as base64 (megabytes). Never
      // fold that into the turn: it would ride every broadcast/replay.
      return {
        toolCallId: item.id,
        name: 'generate_image',
        caller: 'model',
        provider: 'codex',
        state: statusToToolState(item.status),
        input: { ...(item.revisedPrompt ? { prompt: item.revisedPrompt } : {}) }
      }
    }
    default:
      return null
  }
}

// Build a Turn from one Codex ThreadItem, or null for item kinds we don't
// render (contextCompaction becomes a notice — see itemToNotice).
export function codexItemToTurn(item: CodexThreadItem, threadId: string): Turn | null {
  const turnId = `codex:${threadId}:${item.id}`
  if (item.type === 'userMessage') {
    const parts = userInputToParts(item.content)
    if (parts.length === 0) return null
    return {
      // The echo carries our optimistic id back as `clientId` — reusing it
      // upserts the sender's optimistic bubble in place of a duplicate.
      id: item.clientId || turnId,
      role: 'user',
      origin: { kind: 'user-input' },
      parts
    }
  }
  if (item.type === 'agentMessage') {
    if (!item.text) return null
    return {
      id: turnId,
      role: 'assistant',
      origin: { kind: 'user-input' },
      parts: [{ type: 'text', text: item.text }],
      // The item id keys the live token preview; reporting it as the
      // apiMessageId lets the client clear that preview when the turn lands.
      meta: { apiMessageId: item.id }
    }
  }
  if (item.type === 'reasoning') {
    // Single newline between summary sections — must match the live preview
    // separator (session.ts summaryPartAdded) or the text reflows on land.
    const text = (item.summary ?? []).filter(Boolean).join('\n')
    if (!text) return null
    return {
      id: turnId,
      role: 'assistant',
      origin: { kind: 'user-input' },
      parts: [{ type: 'reasoning', text }],
      meta: { apiMessageId: item.id }
    }
  }
  const call = itemToToolCall(item)
  if (!call) return null
  return {
    id: turnId,
    role: 'assistant',
    origin: { kind: 'user-input' },
    parts: [{ type: 'tool-call', call }]
  }
}

export function codexItemToNotice(item: CodexThreadItem, threadId: string): SystemNotice | null {
  if (item.type !== 'contextCompaction') return null
  return {
    id: `codex:${threadId}:${item.id}`,
    kind: 'compact',
    at: new Date().toISOString()
  }
}

// A child agent thread rebuilt from replay: the parent card carrying the
// nested transcript plus the record itself (same shape session.ts keeps live).
export type SubagentReplay = { toolCallId: string; record: SubagentRecord }

// The parent's `subAgentActivity` items, one per child thread (the last item
// wins so `kind` reflects the child's final state).
export function collectSubagentActivities(thread: CodexThread): CodexThreadItem[] {
  const byChild = new Map<string, CodexThreadItem>()
  for (const turn of thread.turns ?? []) {
    for (const item of turn.items ?? []) {
      if (item.type === 'subAgentActivity' && item.agentThreadId)
        byChild.set(item.agentThreadId, item)
    }
  }
  return [...byChild.values()]
}

// Rebuild a SubagentRecord from the child thread's own replay payload.
// Children are forks of the parent, so their replay inherits the parent's
// turns verbatim (same turn ids) — exclude those. Also drop `subAgentActivity`
// echoes (the child's send-back to the parent) which would render as cryptic
// nested agent cards.
export function childThreadToSubagentRecord(
  child: CodexThread,
  activity: CodexThreadItem,
  parentTurnIds: Set<string>
): SubagentRecord {
  const transcript: Turn[] = []
  let durationMs = 0
  let toolUses = 0
  for (const turn of child.turns ?? []) {
    if (parentTurnIds.has(turn.id)) continue
    if (typeof turn.durationMs === 'number') durationMs += turn.durationMs
    for (const item of turn.items ?? []) {
      if (item.type === 'subAgentActivity') continue
      const t = codexItemToTurn(item, child.id)
      if (!t) continue
      if (t.parts.some(p => p.type === 'tool-call')) toolUses++
      transcript.push(t)
    }
  }
  const status =
    activity.kind === 'failed'
      ? ('failed' as const)
      : child.status?.type === 'active'
        ? ('running' as const)
        : ('completed' as const)
  return {
    taskId: child.id,
    description: activity.agentPath?.split('/').pop() || 'sub-agent',
    progress: [],
    status,
    // Zero counts stay out: codex's child replay drops commandExecution
    // items, and a "Took 0 steps" subline reads as broken.
    ...(durationMs || toolUses
      ? {
          usage: {
            ...(durationMs ? { durationMs } : {}),
            ...(toolUses ? { toolUses } : {})
          }
        }
      : {}),
    transcript
  }
}

// Static replay path: map a `thread/read`/`thread/resume` payload (turns
// included) onto StreamEvents for the REST events endpoint. `subagents`
// (child thread id → replay record) re-attaches nested transcripts to their
// `subAgentActivity` cards.
export function codexThreadToEvents(
  thread: CodexThread,
  subagents?: Map<string, SubagentReplay>
): StreamEvent[] {
  const events: StreamEvent[] = []
  for (const turn of thread.turns ?? []) {
    for (const item of turn.items ?? []) {
      const t = codexItemToTurn(item, thread.id)
      if (t) {
        if (item.type === 'subAgentActivity' && item.agentThreadId) {
          const sub = subagents?.get(item.agentThreadId)
          const part = t.parts.find(p => p.type === 'tool-call')
          if (sub && part?.type === 'tool-call') part.call.subagent = sub.record
        }
        events.push({ kind: 'turn', turn: t })
        continue
      }
      const n = codexItemToNotice(item, thread.id)
      if (n) events.push({ kind: 'notice', notice: n })
    }
  }
  return events
}
