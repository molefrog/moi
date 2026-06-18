import type { StreamEvent } from './format'

export type WidgetConfig = {
  rowSpan: 1 | 2 | 3 | 4
  colSpan: 1 | 2 | 3 | 4
  // Env vars this widget's `.server.ts` expects (e.g. `ELEVENLABS_API_KEY`).
  // Purely advisory: it lets the UI surface a "missing key" hint. It never
  // blocks loading — the server function still just reads `process.env`.
  requiredEnv?: string[]
}

export type WidgetInfo = {
  id: string
  config: WidgetConfig
}

// A view is a full-screen, agent-authored "app" (`.moi/views/<name>.tsx`),
// shown one-at-a-time in the workspace nav. Same build/RPC machinery as a
// widget, minus the grid: no sizing, the view owns its own layout and scroll.
export type ViewConfig = {
  // Nav tab label. Falls back to the file name when unset.
  title?: string
  // Advisory env hints, same semantics as WidgetConfig.requiredEnv.
  requiredEnv?: string[]
}

export type ViewInfo = {
  id: string
  config: ViewConfig
}

// Client → Server messages.
// The chat WebSocket is app-wide (one socket for the whole client, not scoped to
// a workspace), so every message carries the `workspaceId` it targets.
export type ClientMessage =
  | {
      type: 'chat'
      workspaceId: string
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
  | { type: 'stop'; workspaceId: string; sessionId: string }

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
// The chat socket is app-wide, so every conversation frame carries both a
// `workspaceId` and a `sessionId` — the client routes each frame to the right
// `(workspaceId, sessionId)` slice of its cache.
export type ServerMessage =
  | (StreamEvent & { sessionId: string; workspaceId: string })
  | StatusMessage
  | SessionRenamedMessage
  | WorkspaceSwitchMessage
  | ErrorFrame
  | StoppedFrame
  | StatusSnapshotMessage

// Frame as constructed by callers of `broadcast(workspaceId, frame)` — the
// `workspaceId` is stamped on by `broadcast`, so callers omit it.
export type BroadcastFrame =
  | (StreamEvent & { sessionId: string })
  | Omit<StatusMessage, 'workspaceId'>
  | Omit<SessionRenamedMessage, 'workspaceId'>
  | Omit<ErrorFrame, 'workspaceId'>
  | Omit<StoppedFrame, 'workspaceId'>

// Sent to a client right after it connects: the authoritative set of currently
// running sessions across all workspaces. The client treats it as ground truth —
// any session NOT listed is marked not-processing — which clears a spinner whose
// terminal `status:false` was emitted while the client was disconnected.
export type StatusSnapshotMessage = {
  type: 'status_snapshot'
  running: { workspaceId: string; sessionId: string }[]
}

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
  // The list endpoint overrides this with the live layout `name` when set.
  name?: string
  // Workspace icon override (base64 data URL), merged in from the layout by the
  // list endpoint. Undefined → the sidebar uses the provider icon.
  icon?: string
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
  workspaceId: string
  from: string
  to: string
}

export type ErrorFrame = {
  kind: 'error'
  workspaceId: string
  sessionId: string
  content: string
}

export type StoppedFrame = {
  kind: 'stopped'
  workspaceId: string
  sessionId: string
}

export type StatusMessage = {
  type: 'status'
  workspaceId: string
  sessionId: string
  processing: boolean
}

// Workspace layout persistence
export type LayoutGridItem = { i: string; x: number; y: number }

// Persisted chat dock position. Fullscreen is NOT a position — it's a transient
// local view (the "Chat" tab) that overrides the position, so it isn't stored.
export type ChatMode = 'sidebar' | 'floating'

// How the chat is actually shown: its persisted position, or fullscreen while
// the chat view is active.
export type ChatDisplay = ChatMode | 'fullscreen'

export type { FontTheme, ColorTheme } from './themes'

export type WorkspaceLayout = {
  version: 1
  widgetGrid: LayoutGridItem[]
  chatMode: ChatMode
  // User-set display-name override. When empty/undefined the API falls back to
  // the workspace folder name, so the resolved name always comes from the API.
  name?: string
  // Workspace icon override — a base64 data URL (128×128 transparent WebP,
  // produced by the server). Undefined falls back to the provider icon.
  icon?: string
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

// Where a custom secret is allowed to flow: the widget function workers, the
// agent's Bash, or both. Lets a key meant for a widget stay out of the agent's
// (bypass-permissions) environment, and vice versa.
export type EnvScope = 'widgets' | 'agent' | 'both'

// One effective env var, as surfaced by GET /api/workspaces/:id/env. Values are
// NEVER returned — the API masks both `.env` and custom secrets, so editing is
// write-only. Presence in the list (with `source`) is all the UI needs.
export type WorkspaceEnvVar = {
  key: string
  // `dotenv`: only from a `.env` file. `custom`: only a UI-managed secret.
  // `both`: a custom secret shadowing a `.env` value (custom wins).
  source: 'dotenv' | 'custom' | 'both'
  // Sink scope — present for custom/both (UI-managed) keys.
  scope?: EnvScope
  // The `.env` files that declare this key (when dotenv-sourced).
  files?: string[]
}

// GET /api/workspaces/:id/env payload — the env view for the settings UI.
export type WorkspaceEnvView = {
  vars: WorkspaceEnvVar[]
  // Discovered `.env` files with how many keys each holds (values masked).
  files: { file: string; count: number }[]
  inheritDotenv: boolean
  // Where custom secrets are stored: the OS keychain (Bun.secrets) when
  // available, else a 0600 file fallback. Surfaced so the UI can warn.
  backend: 'keychain' | 'file'
  // Keys declared via widget `config.requiredEnv`, with whether they're visible
  // to widgets in the effective env and which widgets asked for them.
  required: { key: string; satisfied: boolean; widgets: string[] }[]
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
