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
      // Model id to run this turn with (from the picker / `supportedModels()`
      // `value`). Omitted means the server's default. Applied per turn, so it
      // can change between messages in the same session.
      model?: string
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
  // Model id chosen in the composer picker (`supportedModels()` `value`, an
  // alias like `sonnet`). Persisted so the choice survives a reload. Sent with
  // each chat frame; undefined means the agent runs on the SDK default. Note
  // the transcript records the *resolved* id (e.g. `claude-sonnet-4-6`), which
  // doesn't map back to these aliases — hence we persist the pick here.
  selectedModel?: string
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
// A model a workspace's agent backend can run — the raw shape from the Claude
// Agent SDK's supportedModels(), passed through as-is (server/agent.ts). OpenClaw
// maps its catalog onto value/displayName.
export type Model = {
  // Id used to select the model (Claude `value`; OpenClaw catalog id).
  value: string
  // Human-readable label (Claude `displayName`; OpenClaw `name`).
  displayName: string
  // " · "-joined blurb (Claude): "<headline> · <tagline> · …". Absent for OpenClaw.
  description?: string
  // Effort/reasoning support (Claude). `supportedEffortLevels` can include values
  // the SDK under-types (e.g. 'xhigh'), so it stays string[].
  supportsEffort?: boolean
  supportedEffortLevels?: string[]
  supportsAdaptiveThinking?: boolean
  supportsFastMode?: boolean
  supportsAutoMode?: boolean
}

// GET /api/workspaces/:id/models payload.
export type WorkspaceModels = {
  // The agent backend that produced this list — matches the workspace provider.
  provider: WorkspaceType
  models: Model[]
}
