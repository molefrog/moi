import type { StreamEvent } from './format'

export type WidgetConfig = {
  rowSpan: 1 | 2 | 3 | 4
  colSpan: 1 | 2 | 3 | 4
}

export type WidgetInfo = {
  id: string
  config: WidgetConfig
}

// Client → Server messages
export type ClientMessage =
  | {
      type: 'chat'
      content: string
      sessionId: string
      isNew: boolean
      // Client-chosen stable id for the user's turn. The server tells the
      // adapter to use this id when the SDK echoes the user input back, so
      // the optimistic bubble the client rendered gets upserted in place.
      optimisticId?: string
    }
  | { type: 'stop'; sessionId: string }

// Session info returned by list endpoint
export type SessionInfo = {
  sessionId: string
  summary: string
  lastModified: number
  cwd?: string
}

// Re-export the display format
export type {
  Citation,
  Part,
  ResultSummary,
  SessionSnapshot,
  StreamEvent,
  SubagentRecord,
  SubagentStatus,
  SystemNotice,
  ToolCall,
  ToolCaller,
  ToolState,
  Turn,
  TurnMeta,
  TurnOrigin,
  ViewState
} from './format'

// Server → Client messages.
// Every conversation-related frame carries a sessionId so the client can
// route it to the correct session.
export type ServerMessage =
  | (StreamEvent & { sessionId: string })
  | StatusMessage
  | SessionRenamedMessage
  | WorkspaceSwitchMessage
  | ErrorFrame
  | StoppedFrame

export type WorkspaceSwitchMessage = {
  type: 'workspace:switch'
  workspaceId: string
}

export type WorkspaceType = 'claude-code' | 'openclaw' | 'hermes'

// One MCP server's connection status, as surfaced by GET /api/workspaces/:id/mcp
// (a subset of the agent SDK's McpServerStatus — only what the UI renders).
export type McpServerState = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'

export type McpServer = {
  name: string
  status: McpServerState
}

export type WorkspaceEntry = {
  id: string
  path: string
  addedAt: string
  type?: WorkspaceType
  // Display name captured at add time (e.g. OpenClaw IDENTITY.md "Name:" or
  // basename). Persisted so we don't re-probe the gateway for each listing.
  name?: string
  // Home-relative rendering of `path` (e.g. "~/.openclaw/workspace"). Set by
  // the server on the wire — clients render it as-is.
  displayPath?: string
  // OpenClaw-specific metadata captured at add time. "lastRunAt" is a snapshot,
  // not live — refresh on demand if it ever needs to stay accurate.
  agentId?: string
  isDefault?: boolean
  lastRunAt?: string
}

export type DiscoveredWorkspace = {
  path: string
  type: WorkspaceType
  name?: string
  displayPath?: string
  agentId?: string
  isDefault?: boolean
  lastRunAt?: string
}

export type SessionRenamedMessage = {
  type: 'session_renamed'
  from: string
  to: string
}

export type ErrorFrame = {
  kind: 'error'
  sessionId: string
  content: string
}

export type StoppedFrame = {
  kind: 'stopped'
  sessionId: string
}

export type StatusMessage = {
  type: 'status'
  sessionId: string
  processing: boolean
}

// Workspace layout persistence
export type LayoutGridItem = { i: string; x: number; y: number }

export type ChatMode = 'sidebar' | 'floating'

export type { FontTheme, ColorTheme } from './themes'

export type WorkspaceLayout = {
  version: 1
  widgetGrid: LayoutGridItem[]
  chatMode: ChatMode
  // User-set display-name override. When empty/undefined the API falls back to
  // the workspace folder name, so the resolved name always comes from the API.
  name?: string
  theme?: {
    font: import('./themes').FontTheme
    background?: string
    foreground?: string
  }
}

export type WorkspacePreview = {
  cols: number
  items: { x: number; y: number; w: number; h: number }[]
}

// Normalized capability flags shared across backends. An absent flag means
// "unknown / not reported by this backend", not "unsupported".
export type ModelCapabilities = {
  // Adaptive thinking / reasoning support.
  reasoning?: boolean
  // Fast-mode support (Claude).
  fastMode?: boolean
  // Effort levels the model accepts, when it exposes effort selection (Claude).
  // Typed as string[] on purpose: the SDK under-types this as
  // ('low'|'medium'|'high'|'max')[] but at runtime returns more (e.g. 'xhigh'
  // for Opus 4.8), so don't narrow it — let the client render whatever comes.
  effortLevels?: string[]
}

// One model a workspace's agent backend can run, normalized so the client
// renders a single shape regardless of provider.
//   - Claude:   ModelInfo  → { value→id, displayName→name, vendor: 'anthropic', … }
//   - OpenClaw: ModelChoice → { id, name, provider→vendor, contextWindow, reasoning }
export type ModelOption = {
  // Stable id passed back to select this model (alias or full id for Claude,
  // catalog id for OpenClaw).
  id: string
  // Human-readable label.
  name: string
  // The model's serving vendor (e.g. 'anthropic', 'openai'). Distinct from the
  // workspace's agent backend (`WorkspaceModels.provider`).
  vendor?: string
  // Description segments, unformatted, for the client to lay out as it likes.
  // Claude joins these with " · " (version, tagline, pricing, …); we split them
  // back apart rather than pass the pre-joined string. Empty/undefined when the
  // backend reports no description (OpenClaw).
  descriptionParts?: string[]
  // Max context window in tokens, when known (OpenClaw catalog).
  contextWindow?: number
  capabilities?: ModelCapabilities
}

// GET /api/workspaces/:id/models payload.
export type WorkspaceModels = {
  // The agent backend that produced this list — matches the workspace provider.
  provider: WorkspaceType
  models: ModelOption[]
}
