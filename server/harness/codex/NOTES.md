# Codex — integration research

Research notes on driving OpenAI Codex as a moi harness (July 2026). The
adapter shipped on the app-server path recommended below — see §5 for what
implementation against CLI 0.144.5 confirmed/corrected. Codex exposes **two**
programmable surfaces, and they differ enough that the choice shapes the
whole adapter:

1. **`@openai/codex-sdk`** (npm, TypeScript) — a thin wrapper that spawns
   `codex exec` as a fresh subprocess per turn.
2. **`codex app-server`** — a long-lived JSON-RPC 2.0 server bundled with the
   CLI; the protocol behind the official VS Code extension.

**Recommendation: target the app-server.** The exec SDK is missing too much
(no interrupt method, no model list, no token deltas, no steering); the
app-server covers essentially the whole adapter checklist in
[../README.md](../README.md) and even exceeds the Claude Agent SDK in places.

Sources: [SDK TypeScript source](https://github.com/openai/codex/tree/main/sdk/typescript/src),
[app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md),
[Codex SDK docs](https://developers.openai.com/codex/sdk).

## 1. The exec SDK (`@openai/codex-sdk`)

```ts
const codex = new Codex({ env, config }) // env REPLACES process.env, not merged
const thread = codex.startThread({
  model,
  sandboxMode,
  workingDirectory,
  modelReasoningEffort,
  approvalPolicy
})
const { events } = await thread.runStreamed(input, { outputSchema, signal })
```

- Every `run()`/`runStreamed()` spawns `codex exec` (`resume <threadId>` after
  the first turn) and exits when the turn ends. Thread state persists in
  `~/.codex/sessions`; the in-memory `Thread` is just an id + options.
- Because each turn is a new process, _every_ setting is effectively per-turn
  (`resumeThread(id, newOptions)`) — but there's also no live process to
  interrupt (`AbortSignal` kills it) or steer.
- Events are **item-level**, not token-level: `thread.started`, `turn.started`,
  `item.started/updated/completed`, `turn.completed { usage }`, `turn.failed`.
  Item union: `agent_message`, `reasoning`, `command_execution` (aggregated
  output + exit code), `file_change` (patch summary), `mcp_tool_call`,
  `web_search`, `todo_list`, `error`.
- Input: plain string or `{type:"text"}` / `{type:"local_image", path}` — no
  base64 image blocks; uploads must be materialized to disk (we already do
  this for OpenClaw).
- No model list, no session list API, no MCP status probe, no approval
  callbacks. Structured output via `outputSchema` (JSON Schema/Zod) is the one
  feature CC lacks.

Fine for CI-style one-shot runs; too thin for a moi chat harness.

## 2. The app-server (`codex app-server`)

JSON-RPC 2.0 over **stdio** (newline-delimited JSON, `"jsonrpc"` header
omitted — same transport style as a stdio MCP server). Other transports
(unix socket, websocket) exist but stdio is the only production-supported one.

### Topology

- **One process serves N threads in N different cwds.** `cwd` is per-thread
  (`thread/start`) and overridable per-turn. `thread/loaded/list` shows what's
  in memory; a thread with no subscribers and no activity for 30 min is
  unloaded (`thread/closed`). This replaces most of `claude-code/session.ts`'s
  eviction/idle-TTL machinery.
- **Env vars are process-level.** There is no per-thread env injection, so
  moi's per-workspace `workspaceEnv` doesn't map onto a single shared process.
  Options: one app-server per workspace (env frozen at spawn, restart on env
  change — same semantics as `restartWorkspaceSessions`), or accept
  process-level env.
- Handshake: one `initialize` request per connection (with `clientInfo`), then
  an `initialized` notification. Everything before that is rejected.
- The wire carries three shapes the client must route: responses (matched by
  `id`), notifications, and **server-initiated requests** the client must
  answer (approvals, dynamic tool calls).
- Backpressure: overload → error `-32001`, retry with backoff.
- Crash recovery: respawn + `thread/resume` (threads persist in
  `~/.codex/sessions`).

### Core flow

```
thread/start | thread/resume | thread/fork   → thread id, auto-subscribes
turn/start { threadId, input, model?, effort?, outputSchema?, ... }
  ← turn/started
  ← item/started / item/*/delta / item/completed   (per item)
  ← turn/completed { status: completed|interrupted|failed }
turn/steer { expectedTurnId, input }    — append input to the RUNNING turn
turn/interrupt { threadId, turnId }
```

Per-turn overrides (`model`, `effort`, `summary`, sandbox/approval policy)
become the thread's defaults for later turns — no drain-then-rebuild dance at
all. `thread/settings/update` queues setting changes without starting a turn.

### additionalContext (native per-turn ambient context)

`turn/start` and `turn/steer` take an experimental
`additionalContext: { <key>: { value, kind: 'untrusted' | 'application' } }`
map (openai/codex#24154, shipped in 0.135.0, May 2026) — moi uses it for the
`<moi-context>` envelope (key `moi-context`, kind `application`, so the wire
tag matches the tag the moi-workspace skill triggers on):

- `application` injects a developer-role message `<key>value</key>`;
  `untrusted` a user-role `<external_key>value</external_key>`. Values are
  middle-truncated to a ~1,000-token budget.
- Send the map every turn; the server diffs per key and injects only when a
  value CHANGED since the last turn — unchanged keys cost nothing.
- Injected fragments never appear as `userMessage` items (live or on
  `thread/read` replay), so nothing to strip.
- Gated: requires `initialize.capabilities.experimentalApi: true`, else a
  new-enough server rejects the request when the field is present.
- Servers < 0.135 have no `deny_unknown_fields` on TurnStartParams and
  silently DROP the field — no error to detect. The only reliable support
  signal is the version in the initialize response's `userAgent`
  (`codex_cli_rs/<semver> …`) — see `codexSupportsAdditionalContext`
  (client.ts). Below the cutoff the session path appends the envelope to the
  text item instead (adapter strips it from echoes).

### Feature map vs the adapter checklist

- **Models**: `model/list` — models with ordered `supportedReasoningEfforts`,
  exactly what the picker needs.
- **Streaming**: `item/agentMessage/delta`, `item/reasoning/summaryTextDelta`
  (+ raw `textDelta`), `item/commandExecution/outputDelta` (live command
  output — CC has no equivalent). Per-connection opt-out via
  `initialize.capabilities.optOutNotificationMethods`, so non-streaming mode
  is a handshake flag, not a session rebuild.
- **Items**: `userMessage` (echoes our `clientUserMessageId` as `clientId` —
  native optimistic-id rendezvous), `agentMessage`, `reasoning`
  (summary vs raw content), `commandExecution` (cwd, exit code, duration),
  `fileChange` (structured per-file diffs), `mcpToolCall`, `collabToolCall`
  (subagents: spawn/send/wait/close), `webSearch`, `todoList`/`plan`
  (`turn/plan/updated`), `imageView`, `contextCompaction`, review items.
  Plus `turn/diff/updated` — an aggregated unified diff for the whole turn.
- **Approvals**: interactive server→client JSON-RPC requests
  (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`,
  `item/permissions/requestApproval`) answered with
  `accept | acceptForSession | decline | cancel`. Or delegate with
  `approvalsReviewer: "auto_review"`. Sandbox modes / named permission
  profiles (`:read-only`, `:workspace`).
- **Input**: `{type:"text"}`, `{type:"image", url:"data:..."}` (inline data
  URL — our base64 upload path works), `{type:"localImage", path}`, plus
  skill invocation items (`{type:"skill", name, path}`).
- **History**: `thread/list` (cursor pagination, cwd filter, search),
  `thread/read` (without resuming), `thread/turns/list`, archive/unarchive/
  delete, `thread/name/set`. Replaces jsonl-scraping entirely.
- **MCP**: `mcpServerStatus/list` (tools + auth status — our whole `mcp.ts`
  probe becomes one call), `mcpServer/oauth/login`, `config/mcpServer/reload`.
- **Usage**: `thread/tokenUsage/updated` streamed live (restored on resume);
  `account/rateLimits/read` + `/updated`, `account/usage/read`.
- **Errors**: typed `codexErrorInfo` enum (`ContextWindowExceeded`,
  `UsageLimitExceeded`, `HttpConnectionFailed{status}`, …).
- **Auth**: `account/read`, `account/login/start` (API key / ChatGPT OAuth /
  device code), `account/updated` notifications.
- **Extras with no CC equivalent**: `review/start` (built-in reviewer),
  `thread/shellCommand` (user `!` commands injected into the turn),
  `command/exec` / `process/spawn` (sandboxed/unsandboxed exec with PTY),
  `fs/*` + `fs/watch`, **dynamic client-provided tools** (`item/tool/call` —
  the agent calls back into moi), `thread/compact/start`, structured
  `outputSchema` per turn.

### Caveats

- Much of the surface is gated behind `capabilities.experimentalApi` or marked
  under development (plugins, environments, realtime). The core
  thread/turn/item/approval/model surface is stable — it's what the VS Code
  extension runs on.
- Typed bindings are generated, version-matched to the installed binary:
  `codex app-server generate-ts --out DIR` (or `generate-json-schema`).

### Binary availability

The adapter resolves `codex` through `../executable.ts`: first a PATH lookup
over the server's PATH merged with the user's login-shell PATH
(`../shell-path.ts`), then the known macOS app-bundle locations —
`/Applications/ChatGPT.app/Contents/Resources/codex` and the legacy
`/Applications/Codex.app/Contents/Resources/codex` — since Codex Desktop
manages an app-internal binary that is not shell-visible. PATH wins over the
bundle probe, so a deliberately installed CLI is never shadowed. If nothing
resolves, install the CLI with
`curl -fsSL https://chatgpt.com/codex/install.sh | sh`.

## 3. Client libraries

- **TypeScript: nothing official.** `@openai/codex-sdk` wraps exec only.
- **Python: official** — `openai-codex` on PyPI (`sdk/python` in openai/codex)
  is a real app-server client: subprocess + stdio JSON-RPC, message router,
  generated pydantic models, approval handler callbacks. Good design
  reference.
- Community TS/JS bridges exist (see the
  [`codex-app-server` GitHub topic](https://github.com/topics/codex-app-server))
  but are small/young.
- **Plan for moi**: write the thin client ourselves (~200 lines in Bun — spawn,
  line-split stdio, id→promise map, notification + server-request routing;
  same pattern as `../openclaw/gateway.ts`) and use `generate-ts` for
  types.

## 4. Adapter shape

A Codex harness would look much closer to `openclaw/session.ts` than
`claude-code/session.ts`: one long-lived connection to a server that owns session
lifecycle, subscribe per thread, map `item/*` notifications onto
`StreamEvent`s. Capability flags: `liveSettingsPerTurn`, `steering`,
`interactiveApprovals`, `nativeThreadList`, `imagesInline: 'data-url'`.

## 5. Implementation notes (shipped, CLI 0.144.5)

The adapter landed as `client.ts` (process + stdio JSON-RPC client, one
app-server per workspace for env injection), `adapter.ts` (item →
`Turn` mapping, hand-written types), and `session.ts` (per-thread
state, steer/interrupt, previews, usage). Empirical findings beyond §2:

- **Always pass absolute `cwd`.** A relative `thread/start.cwd` is resolved
  against the app-server process cwd, silently nesting paths.
- **Deltas stream by default** — no opt-in needed; moi's `stream` flag only
  gates forwarding them as preview frames.
- **Reasoning summaries need `summary: "auto"` on `turn/start`.** Without it
  the model still reasons (nonzero `reasoningOutputTokens`) but the
  `reasoning` item arrives with EMPTY `summary`/`content` — thinking is
  invisible. With it, summaries stream via `item/reasoning/summaryTextDelta`
  and land populated. Also note reasoning is adaptive: trivial prompts at low
  effort legitimately produce no reasoning item at all.
- **Subagents (collab tools) work unflagged**: the parent emits
  `collabAgentToolCall` (spawn/send/wait/close) and `subAgentActivity` items;
  the child agent runs as its own thread whose full item stream arrives on
  the same connection under `agentThreadId`.
- **`clientUserMessageId` echo confirmed**: the `userMessage` item carries it
  as `clientId`, on live frames only. `thread/read` replay _renumbers_ item
  ids (`item-1`, `item-2`, …) and drops `clientId`, so replayed turn ids never
  match live ones — harmless under upsert-by-id, but don't key anything
  durable on them.
- **`turn/completed` carries no items** (`itemsView: "notLoaded"`); items
  arrive only via `item/started`/`item/completed`.
- **The npm `codex` bin is a Node shim** that spawns the platform binary;
  killing the shim tears down the server via stdin EOF, so no orphans. The
  absolute shim path returned by the PATH lookup is safe to spawn.
- **Rollout files double as a discovery index.** Each thread persists to
  `~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl` whose first
  line is a `session_meta` record with the thread's `cwd` (older formats put
  the meta fields at the top level). `discovery.ts` reads those heads directly
  — workspace discovery works without the binary installed.
- **User-level config bleeds in**: threads start MCP servers and hooks from
  `~/.codex/config.toml` / `hooks.json` per thread; their failures arrive as
  notifications (`mcpServer/startupStatus/updated`, `hook/completed`) we
  currently ignore.
- `thread/start` responses label threads `source: "vscode"` — app-server
  clients are indistinguishable from the VS Code extension in `thread/list`.

## 6. MCP servers & connectors (probed at CLI 0.144.5)

One-off probe: `bun server/harness/codex/probe.ts rpc . mcpServerStatus/list '{}'`.

### `mcpServerStatus/list` payload

`{ data: McpServerStatus[] }`, one entry per server Codex loaded:

- `name` — the registry key (config.toml table name, or injected name).
- `serverInfo` — the server's MCP `initialize` result (`name`, `title`,
  `version`, `description`, `icons`, `websiteUrl`), `null` if it never
  answered. A server can list with `serverInfo: null` and an empty `tools`
  map and still be "configured" — that's what a dead/misbehaving remote
  looks like (no error field).
- `tools` — a **map keyed by tool name**, each value a full MCP tool def:
  `name`, `title`, `description`, `inputSchema`, `outputSchema`,
  `annotations` (`readOnlyHint`/`destructiveHint`/`openWorldHint`), `_meta`.
  This payload is BIG (~0.5 MB with ChatGPT connectors installed) — don't
  fold it into anything broadcast.
- `resources`, `resourceTemplates` — arrays.
- `authStatus` — `bearerToken` (authed HTTP/OAuth), `notLoggedIn` (OAuth
  awaiting `mcpServer/oauth/login`; the one `getCodexMcpStatus` maps to
  `needs-auth`), `unsupported` (stdio server, no auth concept).

### `codex_apps` — the ChatGPT connector aggregator

Injected automatically when signed in with a ChatGPT account; **absent from
config.toml**. `serverInfo.name` is `plugin-runtime`. It flattens every
connector installed on the user's ChatGPT account (GitHub, Figma, Granola, …)
into ONE server whose tool names are dotted `<connector>.<tool>`
(`figma.generate_deck`). The true brand lives in each tool's `_meta`:
`connector_id`, `connector_name` ("Figma"), `connector_description`,
`link_id` (the user's authorization to that connector), plus Apps SDK widget
hints (`openai/outputTemplate: "ui://widget/….html"`). This is why the
client's `parseCodexMcp` brands dotted `codex_apps` calls by the prefix
before the dot, not the server name. The adapter does not currently carry
`_meta.connector_name` through to the `ToolCall` — icon/brand matching is
name-based.

### Where MCP servers can be defined (config layers)

From the 0.144.5 binary's config-layer enum, lowest to highest:

1. **User** — `$CODEX_HOME/config.toml` (`[mcp_servers.<name>]`). Shared by
   three writers: hand edits, `codex mcp add/remove`, and other apps (the
   ChatGPT desktop app writes `node_repl` / `computer-use` entries here).
2. **Profile v2** — `$CODEX_HOME/<name>.config.toml`, layered via `-p <name>`
   (legacy `[profiles.<name>]` tables in config.toml also exist).
3. **Project** — `.codex/config.toml` in a trusted repo ("sandbox, MCP,
   hooks, model, or reasoning defaults").
4. **Session flags** — `-c 'mcp_servers.foo.command="…"'` per invocation.
5. **Plugins** — an enabled plugin can provide MCP servers ("not configured
   in config.toml or an enabled plugin").
6. **Account-injected** — `codex_apps` (above); server-side, no local file.
7. **Admin layers** — system config.toml, MDM managed preferences, legacy
   `managed_config.toml`, and an enterprise-managed cloud layer;
   `requirements.toml` restricts (never defines) what the others may set.

The app-server can also edit the user layer programmatically
(`config/value/write`, `config/batchWrite`) — unused by moi.

### The full MCP RPC surface (from the 0.144.5 binary's method enums)

Requests:

- `mcpServerStatus/list` — the registry dump above.
- `mcpServer/tool/call` — **direct one-off tool invocation, no model turn**:
  `{ threadId, server, tool, arguments }` → a raw MCP `CallToolResult`
  (`{ content: [...], isError }`). Requires a live `threadId` (MCP servers
  are started per thread), but `thread/start` + call works without ever
  running a turn — verified against `mastra_docs`. Argument validation
  errors come back as `isError: true` content, not JSON-RPC errors.
- `mcpServer/resource/read` — read an MCP resource by uri.
- `mcpServer/oauth/login` — start OAuth for a `notLoggedIn` server;
  completion arrives as the `mcpServer/oauthLogin/completed` notification.
- `config/mcpServer/reload` — re-read server definitions without a restart.
- `config/read`, `config/value/write`, `config/batchWrite`,
  `configRequirements/read` — inspect/edit the config layers that define
  servers.

Notifications: `mcpServer/startupStatus/updated` (per-thread startup
progress/failures — we currently ignore it), `mcpServer/oauthLogin/completed`,
`item/mcpToolCall/progress` (progress of an in-turn MCP call).

Server→client request: `mcpServer/elicitation/request` — an MCP server
asking the user for input mid-call, forwarded for the client to answer.

## 7. Type maintenance (`generate-ts`)

The wire types in `adapter.ts`/`client.ts` are a hand-written defensive
subset of the protocol, produced against the bindings from:

```
codex app-server generate-ts --out /tmp/codex-types   # CLI 0.144.5
```

They are deliberately NOT generated at build time: users run arbitrary codex
CLI versions, so the runtime reads frames defensively regardless, and
vendoring ~600 generated files (or generating in CI) would couple typecheck
to an installed codex binary. When bumping the supported CLI version, re-run
`generate-ts` into a scratch dir and diff the relevant definitions
(`v2/ThreadItem`, `v2/TurnStartParams`, `ServerNotification`, `ServerRequest`)
against the subset here.
