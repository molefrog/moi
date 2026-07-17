// The harness contract: what an agent backend must implement to be drivable
// by moi. See README.md in this folder for the full checklist and the
// message-type layers; each harness's index.ts exports one Harness object
// wrapping its session/adapter/transport modules.
import type {
  DiscoveredWorkspace,
  HarnessAvailability,
  McpServer,
  Model,
  SessionActivity,
  SessionInfo,
  StreamEvent,
  WorkspaceEntry,
  WorkspaceType
} from '@/lib/types'

// The superset of what any backend needs to accept a user message; harnesses
// ignore fields they don't support (e.g. OpenClaw ignores model/effort/stream,
// only OpenClaw reads agentId).
export type SendMessageInput = {
  workspaceId: string
  workspacePath: string
  sessionId: string
  isNew: boolean
  content: string
  // Upload ids from POST .../uploads, resolved by the harness into its input
  // capability (base64 blocks / data URLs / temp-file path notes).
  attachments?: string[]
  optimisticId?: string
  model?: string
  effort?: string
  stream?: boolean
  // OpenClaw: the gateway agent that owns the workspace.
  agentId?: string
}

// Static, per-harness feature flags. These let orchestration code stay
// generic instead of special-casing providers (e.g. the models endpoint's
// streaming toggle). An entry describes what the BACKEND can do — partial
// support/workarounds are documented in README.md's capability matrix.
export type HarnessCapabilities = {
  // Can the UI offer live token-by-token streaming for this backend?
  supportsStreaming: boolean
  // How image attachments reach the agent.
  imagesInline: 'base64' | 'data-url' | 'path-note'
  // Model/effort can change mid-session without a rebuild dance.
  liveModelSwitch: boolean
  liveEffortSwitch: boolean
  // Does the backend echo the sent user message back (with our optimistic id)?
  nativeUserEcho: boolean
}

// Home-page workspace card data beyond thumbnails: latest session activity
// and (for widget-less workspaces) the oldest session's first user message.
export type WorkspaceActivityPreview = {
  firstUserMessage?: string
  updatedAt?: number
}

export type Harness = {
  id: WorkspaceType
  capabilities: HarnessCapabilities

  // -- chat lifecycle ---------------------------------------------------------
  sendMessage(input: SendMessageInput): Promise<void>
  interrupt(workspaceId: string, sessionId: string): Promise<void>
  // Every session whose activity is not `idle`, across all workspaces (drives
  // the status snapshot and view-builder reconciliation). Activity is mirrored
  // from the backend's native lifecycle signal, never derived by counting.
  activeSessions(): { workspaceId: string; sessionId: string; activity: SessionActivity }[]

  // -- discovery / metadata ---------------------------------------------------
  listSessions(ws: WorkspaceEntry): Promise<SessionInfo[]>
  // Home-page card preview. Called for every card on the home screen, so
  // implementations must stay cheap: no process spawns, no per-session
  // transcript reads unless cached. Failures resolve to {} — the card
  // renders without the activity fields.
  workspacePreview(
    ws: WorkspaceEntry,
    includeFirstUserMessage: boolean
  ): Promise<WorkspaceActivityPreview>
  sessionEvents(ws: WorkspaceEntry, sessionId: string): Promise<StreamEvent[]>
  listModels(ws: WorkspaceEntry): Promise<Model[]>
  // MCP server status for the connectors UI; absent = backend has no MCP story.
  mcpStatus?(ws: WorkspaceEntry): Promise<McpServer[]>
  // Workspaces this backend knows about that aren't registered yet.
  discoverWorkspaces?(registeredPaths: Set<string>): Promise<DiscoveredWorkspace[]>
  // Is the backend's runtime present on this machine? Absent = always
  // available. Cheap enough to call per request (a PATH lookup, not a probe).
  availability?(): Promise<HarnessAvailability>

  // -- host integration hooks -------------------------------------------------
  // Env is frozen at spawn everywhere; this reaps idle sessions/processes so
  // the next message picks up fresh env.
  onEnvChanged?(workspacePath: string): void
  // Server shutdown: kill child processes so nothing is orphaned.
  shutdown?(): void
  // Where this backend loads workspace skills from (workspace provisioning).
  skillsDir?(workspaceRoot: string): string
  // Extra payload for the /dev/harness debug page (e.g. codex process info).
  debugInfo?(ws: WorkspaceEntry): Promise<unknown>
  // Key this harness taps its wire frames under in debug.ts (defaults to the
  // workspace id; codex taps by workspacePath — its process client doesn't
  // know workspace ids).
  wireScope?(ws: WorkspaceEntry): string
  // Lines for the /status introspection page.
  statusLines?(now: number): string[]
}
