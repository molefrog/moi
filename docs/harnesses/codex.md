# Codex — integration research

Research notes on driving OpenAI Codex as a moi harness (July 2026, no code
yet). Codex exposes **two** programmable surfaces, and they differ enough that
the choice shapes the whole adapter:

1. **`@openai/codex-sdk`** (npm, TypeScript) — a thin wrapper that spawns
   `codex exec` as a fresh subprocess per turn.
2. **`codex app-server`** — a long-lived JSON-RPC 2.0 server bundled with the
   CLI; the protocol behind the official VS Code extension.

**Recommendation: target the app-server.** The exec SDK is missing too much
(no interrupt method, no model list, no token deltas, no steering); the
app-server covers essentially the whole adapter checklist in
[README.md](README.md) and even exceeds the Claude Agent SDK in places.

Sources: [SDK TypeScript source](https://github.com/openai/codex/tree/main/sdk/typescript/src),
[app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md),
[Codex SDK docs](https://developers.openai.com/codex/sdk).

## 1. The exec SDK (`@openai/codex-sdk`)

```ts
const codex = new Codex({ env, config })        // env REPLACES process.env, not merged
const thread = codex.startThread({ model, sandboxMode, workingDirectory,
                                   modelReasoningEffort, approvalPolicy })
const { events } = await thread.runStreamed(input, { outputSchema, signal })
```

- Every `run()`/`runStreamed()` spawns `codex exec` (`resume <threadId>` after
  the first turn) and exits when the turn ends. Thread state persists in
  `~/.codex/sessions`; the in-memory `Thread` is just an id + options.
- Because each turn is a new process, *every* setting is effectively per-turn
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
  unloaded (`thread/closed`). This replaces most of `cc-session.ts`'s
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

### Binary availability (Codex Desktop caveat)

Don't assume Codex Desktop puts `codex` on PATH. The desktop app is a CLI
*consumer*: it resolves an external codex binary (honoring `CODEX_CLI_PATH`,
then PATH) and on first launch can install/update `@openai/codex` with a Node
runtime bundled inside the app — app-managed, not necessarily a shell-visible
`codex` command. Officially the CLI is a separate install (`npm i -g
@openai/codex`, brew, or the standalone installer). The adapter should detect
the binary: explicit config → `CODEX_CLI_PATH` → `codex` on PATH → error with
install instructions.

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
  same pattern as `server/openclaw-gateway.ts`) and use `generate-ts` for
  types.

## 4. Adapter shape

A Codex harness would look much closer to `openclaw-session.ts` than
`cc-session.ts`: one long-lived connection to a server that owns session
lifecycle, subscribe per thread, map `item/*` notifications onto
`StreamEvent`s. Capability flags: `liveSettingsPerTurn`, `steering`,
`interactiveApprovals`, `nativeThreadList`, `imagesInline: 'data-url'`.
