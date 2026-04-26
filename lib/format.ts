// Display-only conversation format. Agent-agnostic.
// Source: dev/sdk-message-spec.md §14 (and the research PDF under dev/report).
// Built at ingest time from an agent's raw stream (today: Claude Agent SDK).

export type ToolCaller = 'model' | 'server-tool' | 'mcp' | 'subagent'

export type ToolState =
  | 'pending'
  | 'approval-pending'
  | 'approval-denied'
  | 'running'
  | 'success'
  | 'error'

export type SubagentStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type SubagentRecord = {
  taskId: string
  description: string
  progress: string[]
  status: SubagentStatus
  usage?: { totalTokens?: number; toolUses?: number; durationMs?: number }
  transcript: Turn[]
}

export type SkillRecord = {
  skillName: string
  body?: string
}

export type ToolCall = {
  toolCallId: string
  name: string
  caller: ToolCaller
  mcpServer?: string
  state: ToolState
  input: unknown
  output?: unknown
  errorText?: string
  sidecar?: Record<string, unknown>
  subagent?: SubagentRecord
  skill?: SkillRecord
}

export type Citation = { url?: string; title?: string; quote?: string }

export type Part =
  | { type: 'text'; text: string; citations?: Citation[] }
  | { type: 'reasoning'; text: string; redacted?: boolean; signature?: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'file'; mediaType: string; url: string; filename?: string }
  | { type: 'source-url'; url: string; title?: string; sourceId: string }
  | { type: 'source-document'; mediaType: string; title: string; sourceId: string }
  | { type: 'data'; name: string; data: unknown }

export type TurnOrigin =
  | { kind: 'user-input' }
  | { kind: 'tool-return'; toolCallId: string }
  | {
      kind: 'synthetic'
      reason: 'skill-body' | 'system-reminder' | 'hook-output' | 'slash-command' | 'other'
    }
  | { kind: 'subagent-prompt'; parentToolCallId: string }
  | { kind: 'inter-session' }
  | { kind: 'replay' }

export type TurnMeta = {
  model?: string
  provider?: string
  stopReason?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; costUsd?: number }
}

export type Turn = {
  id: string
  role: 'user' | 'assistant'
  origin: TurnOrigin
  parentTaskId?: string
  parts: Part[]
  timestamp?: string
  // Stable monotonic ordering hint when the source provides one (OpenClaw's
  // `__openclaw.seq`). Used as a tiebreaker when timestamps collide; the UI
  // is free to ignore it.
  seq?: number
  meta?: TurnMeta
}

export type McpServerInfo = { name: string; status: string }
export type PluginInfo = { name: string; path: string }

export type SessionSnapshot = {
  sessionId: string
  model?: string
  cwd?: string
  permissionMode?: string
  tools: string[]
  mcpServers: McpServerInfo[]
  plugins: PluginInfo[]
  skills: string[]
  slashCommands: string[]
  agents: string[]
  updatedAt: string
}

export type SystemNotice =
  | {
      id: string
      kind: 'rate-limit'
      at: string
      info?: unknown
    }
  | {
      id: string
      kind: 'api-retry'
      at: string
      attempt: number
      maxRetries: number
      delayMs: number
      error?: string
    }
  | { id: string; kind: 'compact'; at: string; metadata?: unknown }
  | {
      id: string
      kind: 'hook'
      at: string
      hookId: string
      hookName: string
      event: string
      status: 'started' | 'progress' | 'response'
      output?: string
      exitCode?: number
      outcome?: 'success' | 'error' | 'cancelled'
    }
  | {
      id: string
      kind: 'session-state'
      at: string
      state: 'idle' | 'running' | 'requires-action'
    }
  | {
      id: string
      kind: 'files-persisted'
      at: string
      files: string[]
      failed: { filename: string; error: string }[]
    }
  | { id: string; kind: 'elicitation'; at: string; server: string; elicitationId: string }

export type ResultSummary = {
  subtype:
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  cost?: number
  turns?: number
  durationMs?: number
}

// Stream events emitted by the adapter.
// Semantics: upsert-by-id for `turn` and `snapshot`; append for `notice`; replace for `result`.
export type StreamEvent =
  | { kind: 'snapshot'; snapshot: SessionSnapshot }
  | { kind: 'turn'; turn: Turn }
  | { kind: 'notice'; notice: SystemNotice }
  | { kind: 'result'; result: ResultSummary }

// Materialized view state the UI renders from.
export type ViewState = {
  snapshot?: SessionSnapshot
  turns: Turn[]
  notices: SystemNotice[]
  result?: ResultSummary
}

export function emptyViewState(): ViewState {
  return { turns: [], notices: [] }
}

export function applyEvent(state: ViewState, ev: StreamEvent): ViewState {
  switch (ev.kind) {
    case 'snapshot':
      return { ...state, snapshot: ev.snapshot }
    case 'turn': {
      const idx = state.turns.findIndex(t => t.id === ev.turn.id)
      const turns =
        idx >= 0 ? state.turns.map((t, i) => (i === idx ? ev.turn : t)) : [...state.turns, ev.turn]
      return { ...state, turns }
    }
    case 'notice': {
      if (state.notices.some(n => n.id === ev.notice.id)) {
        return {
          ...state,
          notices: state.notices.map(n => (n.id === ev.notice.id ? ev.notice : n))
        }
      }
      return { ...state, notices: [...state.notices, ev.notice] }
    }
    case 'result':
      return { ...state, result: ev.result }
  }
}

export function applyEvents(events: StreamEvent[]): ViewState {
  return events.reduce(applyEvent, emptyViewState())
}
