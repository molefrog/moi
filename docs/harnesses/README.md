# Harnesses

A **harness** is an agent backend moi can drive: it receives user messages,
runs an agentic loop (model + tools) in a workspace, and streams back events
that moi normalizes into its agent-agnostic display format
(`lib/format.ts` — `StreamEvent` / `Turn` / `Part`).

Each harness gets a server-side session module and an adapter that maps its
native wire format onto `StreamEvent`s:

| Harness                 | Session module               | Adapter                      | Status                |
| ----------------------- | ---------------------------- | ---------------------------- | --------------------- |
| Claude Code (Agent SDK) | `server/cc-session.ts`       | `lib/claude-adapter.ts`      | shipped               |
| OpenClaw (gateway)      | `server/openclaw-session.ts` | `server/openclaw-adapter.ts` | shipped               |
| Codex (app-server)      | `server/codex-session.ts`    | `server/codex-adapter.ts`    | shipped, experimental |

## Implementation status

**Claude Code — shipped, primary harness.** Full chat integration: long-lived
streaming-input sessions with mid-turn message queueing, resume after idle
eviction/restart, interrupt, per-thread model + effort picker (backed by
`supportedModels()`), opt-in live token streaming, image/file attachments,
subagent lanes, MCP status probe, and session list/history replay from the
SDK's `.jsonl` files. Known gaps: runs with `bypassPermissions` only (no
interactive approval flow), token counts from `result` messages are dropped
(only cost/turns/duration surface), and effort/streaming changes require a
teardown-and-resume because the SDK has no live setter for them.

**OpenClaw — shipped, experimental.** Chat over the local gateway's WebSocket
JSON-RPC: sessions seeded cold from `sessions.get` then updated from live
`session.message` frames, abort via `sessions.abort`, per-turn usage (tokens +
cost) into `TurnMeta`, optimistic user-echo rendezvous (the gateway echoes
sends with lag), uploads materialized to file paths. Known gaps: no
token-delta streaming (durable message rows only — deliberate v2 cut), no
model/effort selection, and the gateway is the sole source of truth (no local
persistence; cold restarts re-seed).

**Codex — shipped, experimental.** Chat over `codex app-server` (stdio
JSON-RPC, one process per workspace so `workspaceEnv` injects at spawn —
`server/codex.ts`): thread create/resume with temp-id rename, per-turn model +
effort overrides (both live — no rebuild dance), opt-in token streaming from
`item/*/delta`, mid-turn sends steered into the running turn (`turn/steer`
with `turn/start` fallback), interrupt, per-turn token usage folded into
`TurnMeta`, native optimistic-id rendezvous (`clientUserMessageId` echoes back
as `clientId`), session list via `thread/list` (cwd-filtered) and history
replay via `thread/read`. Runs `danger-full-access` + `approvalPolicy: never`
to match moi's bypass-permissions trust model. Reasoning requires
`summary: 'auto'` per turn (see codex.md §5); subagent collab calls render as
flat tool cards. Known gaps: no interactive approval flow (server→client
approval requests are auto-accepted defensively), the child agent's own
transcript is not nested under the parent's card (it streams on the same
connection, so a CC-style subagent lane is feasible), review items are
dropped, and images ride inline as data URLs only (no `localImage` path
mode).

Debug tooling: `/playground/codex` (live wire log + client frames + trigger
scenarios, backed by `GET /api/workspaces/:id/codex/debug`) and
`scripts/codex-probe.ts` (drive the raw app-server protocol without moi).

Per-harness notes in this folder:

- [claude-code-messages.md](claude-code-messages.md) — Claude Agent SDK wire
  format: every message kind and content block, and how they map to our
  display model.
- [openclaw.md](openclaw.md) — OpenClaw gateway: on-disk layout, WebSocket
  JSON-RPC protocol, auth, RPC surface, integration gotchas.
- [codex.md](codex.md) — OpenAI Codex: the exec-based TypeScript SDK vs the
  app-server JSON-RPC protocol, and which one fits moi.

## What a harness adapter must support

The checklist below is distilled from what the Claude Code integration
actually uses today, plus gaps the OpenClaw adapter surfaced. It doubles as
the evaluation rubric for new harnesses.

### Core lifecycle

- **Create session / send message** — accept a user message into a
  (workspace, session) pair. CC runs one long-lived streaming-input `query()`
  per session with an in-memory input queue so follow-ups are queued, not
  rejected.
- **Resume** — recreate a session from a persisted id after idle eviction or
  server restart. Implies the adapter must learn the backend's _real_ session
  id (CC reports it on `system/init`; we rekey and alias the client's temp id).
- **Interrupt / cancel** — stop the current turn without killing the session,
  and drop queued messages.
- **Teardown** — graceful close on idle TTL, LRU eviction, server shutdown.
- **Turn accounting** — know when a turn ends (CC: `result` message) to drive
  busy/idle state and the processing spinner.

### Per-request configuration

- **List supported models**, including per-model metadata such as supported
  effort levels (drives the picker).
- **Set model** — ideally live mid-session.
- **Set reasoning effort** — CC has no live setter, so `cc-session.ts` does a
  drain-then-teardown-then-resume dance. The adapter contract should express
  per-setting "live-settable vs rebuild-required".
- **Thinking/reasoning display mode.**
- **Token streaming opt-in** (CC: `includePartialMessages`, construct-time).
- **Permissions / tool policy** — allowed tools, permission mode; backends
  with interactive approvals need a prompt-callback path.
- **Env injection + cwd** — per-workspace env for the agent's shell, frozen at
  spawn; idle sessions restart to pick up changes.

### Output stream

- Assistant text, thinking, tool calls + results → `StreamEvent`s, including
  subagent lanes (`parent_tool_use_id`).
- Live token preview as an ephemeral sibling frame, never persisted.
- Images/documents/citations in output.
- System notices: compaction, rate-limit, API retry, hook output.
- Errors, distinguishing user aborts from real failures.
- **User-echo semantics** — whether the backend echoes the sent user message
  back (CC streaming-input: no; OpenClaw gateway: yes, lagged). The
  optimistic-id rendezvous is a first-class adapter concern.

### Input capabilities

- Images (base64 blocks vs file paths — a capability, not a given).
- File attachments (path-note fallback via `lib/attachment-note.ts`).
- Rich content blocks vs plain-string prompts.

### Discovery / metadata

- List sessions + replay history for cold-loading a thread.
- MCP server status / configuration pass-through.
- Init metadata: available tools, slash commands, skills, model in use.
- Session summary/title for the thread list.

### Worth adding to the contract

- **Capability introspection** — a static per-adapter `capabilities` object
  (images inline vs by path? live model switch? token streaming? steering?
  queued input? MCP? subagents?) so session orchestration stays generic.
- Permission requests as events (interactive approvals).
- Usage/cost reporting (tokens per turn).
- Compaction trigger/observe.
- Queued-message semantics: does the backend queue natively or must the
  server?
- Health/auth status events.

## Capability comparison

Legend: ✅ supported · ⚠️ partial/workaround · ❌ missing.

| Feature                  | Claude Agent SDK                                    | OpenClaw gateway          | Codex exec SDK               | Codex app-server                  |
| ------------------------ | --------------------------------------------------- | ------------------------- | ---------------------------- | --------------------------------- |
| Long-lived session       | ✅ subprocess per session                           | ✅ gateway-side           | ❌ process per turn          | ✅ server-side, N threads/process |
| Queue/steer mid-turn     | ⚠️ queued next turn                                 | ⚠️                        | ❌                           | ✅ `turn/steer` into live turn    |
| Resume                   | ✅                                                  | ✅                        | ✅                           | ✅ + fork                         |
| Interrupt                | ✅ `interrupt()`                                    | ✅                        | ⚠️ AbortSignal kills process | ✅ `turn/interrupt`               |
| List models              | ✅ `supportedModels()`                              | ❌                        | ❌                           | ✅ `model/list`                   |
| Live model switch        | ✅ `setModel()`                                     | ❌                        | ⚠️ per-turn (respawn)        | ✅ per-turn override              |
| Live effort switch       | ❌ rebuild                                          | ❌                        | ⚠️ per-turn                  | ✅ per-turn                       |
| Token deltas             | ✅ opt-in                                           | ❌ (v2)                   | ❌ item-level only           | ✅ `item/*/delta`                 |
| Images in input          | ✅ base64 blocks                                    | ⚠️ materialize to path    | ⚠️ path only                 | ✅ data URL or path               |
| Interactive approvals    | ⚠️ (we bypass)                                      | ✅                        | ❌                           | ✅ server→client requests         |
| Session list/history API | ✅ `listSessions()` + jsonl                         | ✅ `sessions.get`         | ❌ read `~/.codex/sessions`  | ✅ `thread/list`/`read`           |
| MCP status               | ✅ `mcpServerStatus()`                              | n/a                       | ❌                           | ✅ `mcpServerStatus/list`         |
| Usage reporting          | ⚠️ cost/duration on `result` (adapter drops tokens) | ✅ tokens + cost per turn | ✅ per turn                  | ✅ live + rate limits             |
| Structured output        | ❌                                                  | ❌                        | ✅ `outputSchema`            | ✅ per turn                       |

## Design lessons so far

- Half of `cc-session.ts` exists because some settings are live-settable
  (`setModel`) and some are construct-time (effort, streaming). Encode that
  distinction per-setting in the adapter interface instead of hardcoding the
  drain-then-rebuild machinery.
- Harnesses split into two topologies: **held-open** (CC subprocess, OpenClaw
  gateway, Codex app-server) and **spawn-per-turn** (Codex exec SDK). The
  session manager should support both.
- Event vocabularies differ in kind, not just names: CC emits raw
  tool_use/tool_result pairs; Codex emits semantic items (a patch, a command)
  with their own lifecycle. The adapter layer is where that converges on
  `ToolCall` parts.
