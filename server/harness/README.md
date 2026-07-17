# Harnesses

A **harness** is an agent backend moi can drive: it receives user messages,
runs an agentic loop (model + tools) in a workspace, and streams back events
that moi normalizes into its agent-agnostic display format.

## The layers

Message types flow through four layers; each has one home:

```
1. wire        the backend's native protocol            per-harness, server-only
   │           CC: Agent SDK messages (SDK types)         harness/claude-code/NOTES.md
   │           OpenClaw: gateway frames                   harness/openclaw/{discovery.ts,NOTES.md}
   │           Codex: app-server JSON-RPC                 harness/codex/{adapter.ts,NOTES.md}
   ▼
2. display     Turn / Part / ToolCall / SystemNotice /  lib/format.ts (shared client+server)
   │           StreamEvent (+ ephemeral StreamPreview)
   │           produced by each harness/<name>/adapter.ts
   ▼
3. socket      ClientMessage / ServerMessage over /ws,  lib/types.ts (wraps layer 2 and
   │           REST payloads (SessionInfo, Models, …)    re-exports it)
   ▼
4. client      React Query cache of StreamEvents +      client/features/chat/*
               ephemeral preview store → ViewState →     (tool-group/format.ts holds the
               TurnView rendering                         per-provider labels/briefs)
```

Rules: **adapters are the only code that sees layer 1** — everything above
speaks layers 2/3 only. `lib/format.ts` and `lib/types.ts` never move into
this folder: the client imports them; they are the shared contract.

Socket-protocol notes the layers rely on (all defined in `lib/types.ts`):

- **`session_renamed`** — a new thread is created under the client's temporary
  uuid, then rekeyed to the backend's real session/thread id.
- **Optimistic-id rendezvous** — the client sends `optimisticId` with each
  chat; the user's bubble must upsert under that id. Backends differ: Codex
  echoes it natively (`clientUserMessageId` → `clientId`), Claude Code never
  echoes (the server synthesizes the turn), OpenClaw echoes lagged (matched
  by text).
- **`status` / `status_snapshot`** — per-session `activity`
  (`idle | running | requires-action`), mirrored from the backend's native
  lifecycle signal — never derived by counting sends vs results. The snapshot
  (sent on connect and re-broadcast periodically) is authoritative: the client
  rebuilds its whole activity map from it, so a lost terminal frame self-heals.
  `requires-action` (agent blocked on user input) is tracked but not rendered
  yet — the client shows no loader for it.
- **`preview`** — live token frames, cumulative text, never persisted;
  cleared when the turn with matching `meta.apiMessageId` lands.

## Folder layout & conventions

```
server/harness/
  README.md          this file
  debug.ts           shared debug taps (wire + client-frame rings) for /dev/harness
  <name>/
    adapter.ts       pure wire → display mapping (layer 1 → 2); owns the
                     hand-written wire types it consumes
    session.ts       live per-thread state machine (send/interrupt/turn
                     accounting/preview forwarding)
    <transport>.ts   process/connection management, named for what it is:
                     codex/client.ts, openclaw/gateway.ts (CC has none — the
                     Agent SDK is the transport)
    discovery.ts / models.ts / sessions.ts / mcp.ts   as needed
    NOTES.md         the backend's wire protocol, empirically verified
    *.test.ts        tests live next to the code they cover
```

- Nothing inside one harness folder imports from a sibling harness.
- Outside code imports only this folder's top level. Documented exceptions:
  `cli.ts` (`moi openclaw init` provisioning) imports
  `harness/openclaw/discovery.ts`; tests may import harness internals.

Current harnesses:

| Harness                 | Session module           | Adapter                  | Status                |
| ----------------------- | ------------------------ | ------------------------ | --------------------- |
| Claude Code (Agent SDK) | `claude-code/session.ts` | `claude-code/adapter.ts` | shipped, primary      |
| OpenClaw (gateway)      | `openclaw/session.ts`    | `openclaw/adapter.ts`    | shipped, experimental |
| Codex (app-server)      | `codex/session.ts`       | `codex/adapter.ts`       | shipped, experimental |

Dev tooling: `/dev/harness` (live wire log + client frames + trigger
scenarios for any workspace, backed by `GET /api/workspaces/:id/harness/debug`
and the taps in `debug.ts`) and `codex/probe.ts` (drive the raw codex
app-server protocol without moi).

## Implementation status

**Claude Code — shipped, primary harness.** Full chat integration: long-lived
streaming-input sessions with mid-turn message queueing, resume after idle
eviction/restart, interrupt, per-thread model + effort picker (backed by
`supportedModels()`), opt-in live token streaming, image/file attachments,
subagent lanes, MCP status probe, and session list/history replay from the
SDK's `.jsonl` files, with per-turn token usage folded into the final
assistant turn. Known gaps: runs with `bypassPermissions` only (no
interactive approval flow), and effort/streaming changes require a
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
`codex/client.ts`): thread create/resume with temp-id rename, per-turn model +
effort overrides (both live — no rebuild dance), opt-in token streaming from
`item/*/delta`, reasoning summaries via `summary: 'auto'`, mid-turn sends
steered into the running turn (`turn/steer` with `turn/start` fallback),
interrupt, per-turn token usage folded into `TurnMeta`, native optimistic-id
rendezvous, session list via `thread/list` (cwd-filtered) and history replay
via `thread/read`, subagent (collab) child threads nested as live
SubagentRecord transcripts on the parent card, semantic exec labels from
`commandActions`, MCP status via `mcpServerStatus/list`, and hook / failed
MCP-startup notices. Workspace discovery scans `~/.codex/sessions` rollout
heads for cwds (`codex/discovery.ts` — no binary needed), and `availability()`
reports a missing codex CLI to the create dialog and the chat banner. Runs `danger-full-access` + `approvalPolicy: never` to
match moi's bypass-permissions trust model. Known gaps: no interactive
approval flow (server→client approval requests are auto-accepted
defensively), and images ride inline as data URLs only (no `localImage` path
mode).

## What a harness adapter must support

The checklist below is distilled from what the Claude Code integration
actually uses today, plus gaps the OpenClaw and Codex adapters surfaced. It
doubles as the evaluation rubric for new harnesses.

### Core lifecycle

- **Create session / send message** — accept a user message into a
  (workspace, session) pair. CC runs one long-lived streaming-input `query()`
  per session with an in-memory input queue so follow-ups are queued, not
  rejected; Codex steers follow-ups into the running turn.
- **Resume** — recreate a session from a persisted id after idle eviction or
  server restart. Implies the adapter must learn the backend's _real_ session
  id (CC reports it on `system/init`; we rekey and alias the client's temp id).
- **Interrupt / cancel** — stop the current turn without killing the session,
  and drop queued messages.
- **Teardown** — graceful close on idle TTL, LRU eviction, server shutdown.
- **Activity mirror** — map the backend's native lifecycle signal onto
  `SessionActivity` (CC: `result` as the turn-over fallback plus
  `session_state_changed` when the CLI emits it; Codex: `turn/started` /
  `turn/completed`; OpenClaw: `agent` lifecycle phases). Flip to `running`
  optimistically on send; a session with live background tasks (CC
  `task_started`/`task_notification`) must not be idle-evicted.

### Per-request configuration

- **List supported models**, including per-model metadata such as supported
  effort levels (drives the picker).
- **Set model** — ideally live mid-session.
- **Set reasoning effort** — CC has no live setter, so `claude-code/session.ts`
  does a drain-then-teardown-then-resume dance; Codex takes it per turn.
- **Thinking/reasoning display mode** (Codex: `summary: 'auto'` is required or
  reasoning items arrive empty).
- **Token streaming opt-in** (CC: `includePartialMessages`, construct-time;
  Codex: always streams, moi gates forwarding).
- **Permissions / tool policy** — allowed tools, permission mode; backends
  with interactive approvals need a prompt-callback path.
- **Env injection + cwd** — per-workspace env for the agent's shell, frozen at
  spawn; idle sessions/processes restart to pick up changes.

### Output stream

- Assistant text, thinking, tool calls + results → `StreamEvent`s, including
  subagent lanes.
- Live token preview as an ephemeral sibling frame, never persisted.
- Images/documents/citations in output.
- System notices: compaction, rate-limit, API retry, hook output.
- Errors, distinguishing user aborts from real failures.
- **User-echo semantics** — see the socket-protocol notes above; the
  optimistic-id rendezvous is a first-class adapter concern.

### Input capabilities

- Images (base64 blocks vs data URLs vs file paths — a capability, not a given).
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
- Compaction trigger/observe.
- Queued-message semantics: does the backend queue natively or must the
  server?
- Health/auth status events.

## Capability comparison

Legend: ✅ supported · ⚠️ partial/workaround · ❌ missing.

| Feature                  | Claude Agent SDK                                    | OpenClaw gateway          | Codex app-server                      |
| ------------------------ | --------------------------------------------------- | ------------------------- | ------------------------------------- |
| Long-lived session       | ✅ subprocess per session                           | ✅ gateway-side           | ✅ server-side, N threads/process     |
| Queue/steer mid-turn     | ⚠️ queued next turn                                 | ⚠️                        | ✅ `turn/steer` into live turn        |
| Resume                   | ✅                                                  | ✅                        | ✅ + fork                             |
| Interrupt                | ✅ `interrupt()`                                    | ✅                        | ✅ `turn/interrupt`                   |
| List models              | ✅ `supportedModels()`                              | ❌                        | ✅ `model/list`                       |
| Live model switch        | ✅ `setModel()`                                     | ❌                        | ✅ per-turn override                  |
| Live effort switch       | ❌ rebuild                                          | ❌                        | ✅ per-turn                           |
| Token deltas             | ✅ opt-in                                           | ❌ (v2)                   | ✅ `item/*/delta`                     |
| Images in input          | ✅ base64 blocks                                    | ⚠️ materialize to path    | ✅ data URL or path                   |
| Interactive approvals    | ⚠️ (we bypass)                                      | ✅                        | ✅ server→client requests (we bypass) |
| Session list/history API | ✅ `listSessions()` + jsonl                         | ✅ `sessions.get`         | ✅ `thread/list`/`read`               |
| Home card preview        | ✅ session file scan                                | ✅ cached first message   | ⚠️ live app-server only               |
| MCP status               | ✅ `mcpServerStatus()`                              | n/a                       | ✅ `mcpServerStatus/list`             |
| Usage reporting          | ⚠️ cost/duration on `result` (adapter drops tokens) | ✅ tokens + cost per turn | ✅ live + rate limits                 |
| Structured output        | ❌                                                  | ❌                        | ✅ per turn                           |

## Design lessons so far

- Half of `claude-code/session.ts` exists because some settings are
  live-settable (`setModel`) and some are construct-time (effort, streaming).
  Encode that distinction per-setting in the adapter interface instead of
  hardcoding the drain-then-rebuild machinery.
- Harnesses split into two topologies: **held-open** (CC subprocess, OpenClaw
  gateway, Codex app-server) and **spawn-per-turn** (Codex exec SDK — see
  `codex/NOTES.md` §1 for why we rejected it). The session manager should
  support both.
- Event vocabularies differ in kind, not just names: CC emits raw
  tool_use/tool_result pairs; Codex emits semantic items (a patch, a command)
  with their own lifecycle. The adapter layer is where that converges on
  `ToolCall` parts.
