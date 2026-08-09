// ACP (Agent Client Protocol) wire types — layer 1 for every ACP-speaking
// backend. Hand-written against protocol v1 as implemented by Hermes Agent
// 0.20.0 (agent-client-protocol 0.9.0) and read defensively: fields other
// agents omit are optional here, and unknown `sessionUpdate` kinds are ignored
// rather than throwing.
//
// Nothing in this folder is Hermes-specific. See ../hermes/NOTES.md for the
// empirical protocol notes these types were derived from.

export type AcpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string }
  | { type: 'resource_link'; uri: string; name?: string }
  | { type: string; [k: string]: unknown }

export type AcpInitializeResult = {
  protocolVersion?: number
  agentInfo?: { name?: string; version?: string }
  agentCapabilities?: {
    loadSession?: boolean
    promptCapabilities?: { image?: boolean; audio?: boolean; embeddedContext?: boolean }
    sessionCapabilities?: { fork?: unknown; list?: unknown; resume?: unknown }
  }
  authMethods?: { id: string; name?: string; description?: string; type?: string }[]
}

export type AcpModelInfo = {
  modelId: string
  name?: string
  description?: string
}

export type AcpModelState = {
  availableModels?: AcpModelInfo[]
  currentModelId?: string
}

export type AcpModeInfo = {
  id: string
  name?: string
  description?: string
}

export type AcpModeState = {
  availableModes?: AcpModeInfo[]
  currentModeId?: string
}

export type AcpNewSessionResult = {
  sessionId: string
  models?: AcpModelState
  modes?: AcpModeState
  _meta?: Record<string, unknown>
}

export type AcpSessionListEntry = {
  sessionId: string
  cwd?: string
  title?: string
  updatedAt?: string
}

export type AcpListSessionsResult = {
  sessions?: AcpSessionListEntry[]
  nextCursor?: string | null
}

// `end_turn` | `cancelled` | `max_tokens` | `refusal` | agent-specific.
export type AcpStopReason = string

export type AcpUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedReadTokens?: number
  thoughtTokens?: number
}

export type AcpPromptResult = {
  stopReason?: AcpStopReason
  usage?: AcpUsage
}

// Tool calls carry a semantic `kind` rather than a raw function name, which is
// what lets the adapter produce good labels without provider-specific tables.
export type AcpToolKind = 'read' | 'edit' | 'execute' | 'search' | 'fetch' | 'think' | 'other'

export type AcpToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type AcpToolCallLocation = { path: string; line?: number }

export type AcpToolCallContent =
  | { type: 'content'; content: AcpContentBlock }
  | { type: 'diff'; path: string; oldText?: string | null; newText?: string }
  | { type: string; [k: string]: unknown }

export type AcpToolCallUpdate = {
  toolCallId: string
  title?: string
  kind?: AcpToolKind
  status?: AcpToolCallStatus
  content?: AcpToolCallContent[]
  locations?: AcpToolCallLocation[]
  rawInput?: unknown
  rawOutput?: unknown
}

export type AcpPlanEntry = {
  content: string
  priority?: string
  status?: 'pending' | 'in_progress' | 'completed'
}

// The `session/update` notification payload, discriminated by `sessionUpdate`.
export type AcpSessionUpdate =
  | { sessionUpdate: 'agent_message_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'agent_thought_chunk'; content: AcpContentBlock }
  | { sessionUpdate: 'user_message_chunk'; content: AcpContentBlock }
  | ({ sessionUpdate: 'tool_call' } & AcpToolCallUpdate)
  | ({ sessionUpdate: 'tool_call_update' } & AcpToolCallUpdate)
  | { sessionUpdate: 'plan'; entries?: AcpPlanEntry[] }
  | { sessionUpdate: 'available_commands_update'; availableCommands?: { name: string }[] }
  | { sessionUpdate: 'current_mode_update'; currentModeId?: string }
  | { sessionUpdate: 'session_info_update'; title?: string; updatedAt?: string }
  // Non-standard but widely useful: context-window meter (Hermes emits it).
  | { sessionUpdate: 'usage_update'; size?: number; used?: number }
  | { sessionUpdate: string; [k: string]: unknown }

export type AcpSessionNotification = {
  sessionId: string
  update: AcpSessionUpdate
}

// Agent→client request: permission for a tool call the agent wants to run.
export type AcpPermissionOption = {
  optionId: string
  name?: string
  kind?: string // allow_once | allow_always | reject_once | reject_always
}

export type AcpRequestPermissionParams = {
  sessionId: string
  toolCall?: AcpToolCallUpdate
  options?: AcpPermissionOption[]
}

export function isTextBlock(
  block: AcpContentBlock | undefined
): block is { type: 'text'; text: string } {
  return !!block && block.type === 'text' && typeof (block as { text?: unknown }).text === 'string'
}

// Flatten a tool call's content array into displayable text. `diff` entries
// render as their new text — the tool card shows the path separately.
export function toolContentToText(content: AcpToolCallContent[] | undefined): string {
  if (!content?.length) return ''
  const out: string[] = []
  for (const entry of content) {
    if (entry.type === 'content' && isTextBlock((entry as { content?: AcpContentBlock }).content)) {
      out.push((entry as { content: { text: string } }).content.text)
    } else if (entry.type === 'diff') {
      const diff = entry as { path?: string; newText?: string }
      if (typeof diff.newText === 'string') out.push(diff.newText)
    }
  }
  return out.join('\n')
}
