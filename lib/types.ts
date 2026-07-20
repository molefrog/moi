import type { PreviewBlock, StreamEvent } from './format'

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
  // Content tag of the built bundle (`<size>-<mtime>` of its index.js) —
  // changes whenever the widget is rebundled. Clients compare it against
  // `WidgetThumbnail.tag` to decide which thumbnails are stale. Absent when
  // the build output can't be statted.
  tag?: string
}

// A view is a full-screen, agent-authored "app" (`.moi/views/<name>.tsx`),
// shown one-at-a-time in the workspace nav. Same build/RPC machinery as a
// widget, minus the grid: no sizing, the view owns its own layout and scroll.
export type ViewConfig = {
  // Nav tab label. Falls back to the file name when unset.
  title?: string
  // App icon registry id used by workspace tabs.
  icon?: string
  // Advisory env hints, same semantics as WidgetConfig.requiredEnv.
  requiredEnv?: string[]
}

export type ViewInfo = {
  id: string
  config: ViewConfig
}

export type ViewBuilderStatus = 'draft' | 'building' | 'waiting' | 'ready'

// The kind of an applet — a custom UI unit embedded in a workspace. Shared by
// the bundler pipeline and the build-status records. On a builder record the
// field is absent for rows written before it existed; treat a missing kind as
// 'view' (only views surface in the UI — the view builder page is view-only).
export type AppletKind = 'view' | 'widget'

export type ViewBuilderInput = {
  requirements: string
}

export type ViewBuilder = {
  id: string
  kind?: AppletKind
  status: ViewBuilderStatus
  input: ViewBuilderInput
  sessionId: string
  viewId?: string
  title?: string
  icon?: string
  error?: string
  // Wall-clock ms when this builder last entered `building`. Used by reconcile
  // to demote a build that has been running too long (a hung/abandoned turn).
  buildingSince?: number
  createdAt: number
  updatedAt: number
}

// ---- Applet error journal (see docs/self-correction.md) ------------------

// Where an applet error was observed. `build` and `rpc` are recorded
// server-side (bundle pipeline, RPC route); `load`/`render`/`window` are
// browser-side and reach the journal via POST /api/workspaces/:id/applet-log.
export type AppletLogSource = 'build' | 'load' | 'render' | 'window' | 'rpc'

// One journal entry, as returned to `moi debug logs`. `kind`/`name` attribute
// the applet when known; `module`/`fn` pin down the server function for `rpc`
// entries. `count` dedups repeats of the identical error (crash loops are one
// line, not a hundred); `ts` is the LAST occurrence.
export type AppletLogEntry = {
  ts: number
  source: AppletLogSource
  kind?: AppletKind
  name?: string
  module?: string
  fn?: string
  message: string
  stack?: string
  count: number
}

// The browser-reported subset (the server-side sources can't be spoofed by a
// tab — the POST route rejects them).
export type AppletClientErrorSource = 'load' | 'render' | 'window'
export type AppletClientError = {
  source: AppletClientErrorSource
  kind: AppletKind
  name: string
  message: string
  stack?: string
}

// A Scratchpad draw/view operation issued by `moi scratch`. Mutations run
// server-side against a headless tldraw store; `view` relays to a live tab. The
// server assigns each add op a `name` (the `--id`, or a generated one) so the
// derived tldraw shape id is deterministic and addressable later. Arrow endpoints
// bind to a shape (by name) or sit at a free point. See docs/moi-scratchpad.md.
export type ScratchPoint = { x: number; y: number }
export type ScratchArrowEnd = { name: string } | ScratchPoint

// The Scratchpad's color palette — the same six swatches the UI toolbar offers,
// so the agent can only paint what the user can. The CLI also accepts an arbitrary
// hex and snaps it to the nearest of these (tldraw shapes hold a palette color, not
// free hex).
export type ScratchColor = 'black' | 'grey' | 'blue' | 'green' | 'yellow' | 'red'

// tldraw's DefaultSizeStyle, exposed under two friendlier CLI names for the two
// shapes that use it: arrows take `--stroke small|large` (line weight), text &
// notes take `--font-size regular|big` (label size). Both map onto the same
// underlying tldraw size — `small`/`regular` → 'm', `large`/`big` → 'xl'.
export type ScratchSize = 'm' | 'xl'

// Fill style for rectangles — the UI toolbar's four options. The CLI takes
// `none|semi|pattern|solid`; ops carry the tldraw DefaultFillStyle value. Note the
// tldraw quirk (see defaultFills / FILL_OPTIONS in client/components/Scratchpad.tsx):
// fill value 'solid' paints the lighter "semi" color, while 'fill' paints the true
// solid (body === border). Keep the names in sync with that client list.
export type ScratchFill = 'none' | 'solid' | 'pattern' | 'fill'

// Optional styling carried by every add op. Omitted fields fall back to the
// shape's tldraw default. `size` is set from `--stroke` (arrows) or `--font-size`
// (text/notes); `fill` from `--fill` (rectangles).
export type ScratchStyle = { color?: ScratchColor; size?: ScratchSize; fill?: ScratchFill }

// Resize preset for `add image`: 'lo' caps the long side smaller (default, keeps
// the canvas light), 'hi' allows more pixels when detail matters.
export type ScratchImageQuality = 'lo' | 'hi'

export type ScratchOp =
  | ({ kind: 'add-text'; name: string; x: number; y: number; text: string } & ScratchStyle)
  | ({
      kind: 'add-rect'
      name: string
      x: number
      y: number
      w: number
      h: number
      text?: string
    } & ScratchStyle)
  | ({ kind: 'add-note'; name: string; x: number; y: number; text: string } & ScratchStyle)
  // Add an image from a local file `path` — the server resizes it to fit the
  // canvas and embeds it (color/stroke don't apply, so no ScratchStyle).
  // `quality` picks the resize preset: 'lo' (default, smaller) or 'hi' (sharper).
  | {
      kind: 'add-image'
      name: string
      x: number
      y: number
      path: string
      quality?: ScratchImageQuality
    }
  | ({
      kind: 'add-arrow'
      name: string
      from: ScratchArrowEnd
      to: ScratchArrowEnd
      // Right-angle (orthogonal) routing for clean diagrams; default is a curved arc.
      elbow?: boolean
    } & ScratchStyle)
  | { kind: 'move'; name: string; x: number; y: number }
  | { kind: 'set'; name: string; text: string }
  | { kind: 'delete'; name: string }
  | { kind: 'clear' }
  | { kind: 'view' }

// What a tab returns after running an op: a shape's `name` for add ops, a PNG
// data URL for `view`, or a bare ack for mutations.
export type ScratchOpResult = { name: string } | { image: string } | { ok: true }

// The process that last persisted `.moi/.scratchpad.json` (always the server —
// browser saves funnel through it). Stamped on save so an older reader hitting
// the snapshot can name the version it needs (see lib/scratchpad-skew.ts).
export type ScratchpadWriter = { moi: string; tldraw: string }

// An attachment uploaded ahead of a chat message. The bytes live server-side in
// an in-memory upload store (see server/uploads.ts); a chat frame references it
// by `id`. `kind` splits the two delivery paths: an `image` is inlined as a
// base64 vision block in the agent message, a `file` is written to a temp path
// the agent can `Read`. Returned by POST /api/workspaces/:id/uploads.
export type UploadKind = 'image' | 'file'
export type UploadInfo = {
  id: string
  kind: UploadKind
  // Normalized media type (images are re-encoded to a vision-safe type).
  mediaType: string
  filename: string
  size: number
  // Pixel dimensions, for images only — lets the composer reserve space.
  width?: number
  height?: number
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
      // Upload ids (from POST .../uploads) to attach to this turn. The server
      // resolves each from its upload store and turns it into a vision block
      // (image) or a temp-file path reference (other files). Order is preserved.
      attachments?: string[]
      // Client-chosen stable id for the user's turn. The server tells the
      // adapter to use this id when the SDK echoes the user input back, so
      // the optimistic bubble the client rendered gets upserted in place.
      optimisticId?: string
      // Model id to run this turn with (from the picker / `supportedModels()`
      // `value`). Omitted means the server's default. Applied per turn, so it
      // can change between messages in the same session.
      model?: string
      // Reasoning effort for this turn (one of the model's `supportedEffortLevels`).
      // Omitted means the SDK default. Unlike model, the SDK has no live setter,
      // so a change forces the live session to resume (see server/cc-session.ts).
      effort?: string
      // Opt into live token-by-token streaming for this turn. Omitted/false runs
      // the current whole-block behavior. Only honored for providers that report
      // `supportsStreaming` (Claude Code); ignored otherwise. Like effort, a
      // change forces the live session to rebuild.
      stream?: boolean
    }
  | { type: 'stop'; workspaceId: string; sessionId: string }
  // Reply to a relayed Scratchpad op (see ScratchpadOpMessage). Carries the
  // op's correlation id so the server settles the right pending CLI request.
  | { type: 'scratchpad:op-result'; opId: string; result?: ScratchOpResult; error?: string }

// Session info returned by list endpoint
export type SessionInfo = {
  sessionId: string
  summary: string
  lastModified: number
  cwd?: string
}

// Per-thread agent settings, persisted server-side in one global file in moi's
// data dir (NOT in the workspace), exposed via GET/PUT
// /api/workspaces/:id/sessions/:sessionId/config. A thread reopens with the same
// model/effort it last ran with; a brand-new thread is seeded from the workspace
// defaults (`WorkspaceLayout.selectedModel`/`selectedEffort`).
export type ThreadConfig = {
  model?: string
  effort?: string
}

// Re-export the display format
export type {
  Citation,
  Part,
  PreviewBlock,
  ResultSummary,
  SessionSnapshot,
  StreamEvent,
  StreamPreview,
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
  | PreviewFrame
  | StatusMessage
  | SessionRenamedMessage
  | WorkspaceSwitchMessage
  | ErrorFrame
  | StoppedFrame
  | StatusSnapshotMessage
  | ScratchpadOpMessage

// A live token-by-token snapshot of an assistant message still being generated.
// Ephemeral: it is NOT a StreamEvent, never persisted, and never folded into the
// durable transcript (React Query cache). The client keeps it in a separate
// ephemeral store and discards it the instant the real `turn` for `messageId`
// lands. `blocks[].text` is CUMULATIVE, so a lost/reordered/duplicated frame is
// simply overwritten by the next one — it can never corrupt the transcript.
export type PreviewFrame = {
  type: 'preview'
  workspaceId: string
  sessionId: string
  // API message id (`msg_...`), globally unique — the accumulator key, so
  // concurrent streams (parallel subagents) never collide. Matches the eventual
  // turn's `meta.apiMessageId`, which is how the client clears this preview.
  messageId: string
  // null = top-level assistant; a tool_use id = a subagent's nested stream.
  parentToolUseId: string | null
  blocks: PreviewBlock[]
}

// A Scratchpad op relayed to the tab(s) showing `workspaceId`'s canvas. Only
// `view` travels this way now (rendering needs the browser); mutations run
// server-side. The tab with a live editor for that workspace executes it and
// replies with a matching `scratchpad:op-result` (correlated by `opId`).
export type ScratchpadOpMessage = {
  type: 'scratchpad:op'
  workspaceId: string
  opId: string
  op: ScratchOp
}

// Frame as constructed by callers of `broadcast(workspaceId, frame)` — the
// `workspaceId` is stamped on by `broadcast`, so callers omit it.
export type BroadcastFrame =
  | (StreamEvent & { sessionId: string })
  | Omit<PreviewFrame, 'workspaceId'>
  | Omit<StatusMessage, 'workspaceId'>
  | Omit<SessionRenamedMessage, 'workspaceId'>
  | Omit<ErrorFrame, 'workspaceId'>
  | Omit<StoppedFrame, 'workspaceId'>

// Sent to a client right after it connects (and re-broadcast periodically): the
// authoritative set of non-idle sessions across all workspaces. The client
// treats it as ground truth — any session NOT listed is marked idle — which
// clears a spinner whose terminal `status` frame was lost (disconnect window,
// dropped frame, harness gap).
export type StatusSnapshotMessage = {
  type: 'status_snapshot'
  sessions: { workspaceId: string; sessionId: string; activity: SessionActivity }[]
}

export type WorkspaceSwitchMessage = {
  type: 'workspace:switch'
  workspaceId: string
}

export type WorkspaceType = 'claude-code' | 'openclaw' | 'codex'

// Whether an agent backend's runtime is installed on this machine. `reason` is
// user-facing copy explaining what to do next. Surfaced by
// GET /api/workspaces/create (per-type map, drives setup dialogs) and
// GET /api/workspaces/:id/availability (disables Send in existing workspaces).
export type HarnessAvailability = { available: true } | { available: false; reason: string }

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
  displayPath?: string
  // Deduplicated in canonical provider order by the discovery API.
  types: WorkspaceType[]
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

// Unified per-session activity state, mirrored from each harness's native
// lifecycle signal (CC `session_state_changed`, Codex `turn/*`, OpenClaw run
// lifecycle) rather than derived by counting messages:
//   running         — the agent is working; the client shows the loader/Stop
//   requires-action — the agent is blocked on user input (permission prompt,
//                     MCP elicitation). Not rendered yet: no loader, no Stop.
//   idle            — everything else, including interrupted/failed turns
export type SessionActivity = 'idle' | 'running' | 'requires-action'

export type StatusMessage = {
  type: 'status'
  workspaceId: string
  sessionId: string
  activity: SessionActivity
}

// Workspace layout persistence
export type LayoutGridItem = { i: string; x: number; y: number }

// Persisted layout of the workspace panel:
//   fullscreen — tabbed full-panel workspace; Agent chat is the first tab
//   split      — Agent chat as a left column, workspace content on the right
export type LayoutMode = 'fullscreen' | 'split'

export type WorkspaceTabId =
  | 'agent'
  | 'widgets'
  | 'scratchpad'
  | `view:${string}`
  | `view-builder:${string}`

export type WorkspaceTabsState = {
  open: WorkspaceTabId[]
  active: WorkspaceTabId
}

export type { FontTheme, ColorTheme } from './themes'

export type WorkspaceLayout = {
  version: 1
  widgetGrid: LayoutGridItem[]
  layoutMode: LayoutMode
  // Open tabs and active tab for the fullscreen/split workspace chrome. The
  // `open` order is persisted so future drag-reordering has one source of truth.
  tabs: WorkspaceTabsState
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
  //
  // This (and `selectedEffort`) is the *workspace default*: the value the picker
  // edits when no thread is open, and the seed a brand-new thread copies. Once a
  // thread exists it carries its own per-thread override (see `ThreadConfig`).
  selectedModel?: string
  // Reasoning-effort default for new threads (a `supportedEffortLevels` value).
  selectedEffort?: string
  theme?: {
    font: import('./themes').FontTheme
    background?: string
    foreground?: string
  }
  // Widget thumbnails captured client-side from the live grid, used for
  // home-screen previews. Saved through their own endpoint (PUT
  // .../thumbnails), never through the layout PUT.
  widgetThumbnails?: WidgetThumbnails
}

export type WidgetThumbnails = {
  // Fingerprint of the grid state the set was captured from (visible widget
  // ids + their bundle tags — see widgetThumbnailsKey()). A mismatch with the
  // live grid re-captures the whole set.
  key?: string
  // Server-stamped ISO time of the last save. Widget DATA drifts even when
  // bundles don't (a dashboard captured in January still shows January), so
  // an old-enough set re-captures despite a matching key.
  at?: string
  // Widget id → WebP data URL (white background, the widget's own aspect
  // ratio). Entries merge, never prune: a removed widget keeps its last image
  // in case it comes back. Heavy — the layout GET strips this field; images
  // reach the home screen via the preview endpoint.
  images?: Record<string, string>
}

// Home-screen workspace card preview: a few captured widget thumbnails (WebP
// data URLs) from the stored layout, rendered as a loose stack, plus the latest
// provider session activity. A workspace with no widgets may instead carry its
// oldest thread's first user message.
export type WorkspacePreview = {
  thumbnails: string[]
  firstUserMessage?: string
  updatedAt?: number
}

// One effective env var, as surfaced by GET /api/workspaces/:id/env. Values are
// NEVER returned — the API masks both `.env` and custom secrets, so editing is
// write-only. Presence in the list (with `source`) is all the UI needs.
export type WorkspaceEnvVar = {
  key: string
  // `dotenv`: only from a `.env` file. `custom`: only a UI-managed secret.
  // `both`: a custom secret shadowing a `.env` value (custom wins).
  source: 'dotenv' | 'custom' | 'both'
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
  // Canonical wire model id this row resolves to (Claude, e.g. 'default' and
  // 'opus[1m]' both → 'claude-opus-4-8[1m]'). Lets the picker map the synthetic
  // "default" entry onto the concrete model it points at.
  resolvedModel?: string
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
  // Whether this provider supports live token-by-token streaming (the picker
  // shows the "Live typing" toggle only when true). Provider-wide, not per-model
  // — Claude Code streams uniformly via `includePartialMessages`.
  supportsStreaming?: boolean
}
