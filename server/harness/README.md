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

System machinery that backends leave in user-role text (slash-command
records, interrupt markers, injected reminder envelopes) is classified by
the shared rule registry in `lib/system-messages.ts` — provider-agnostic,
text-level. Adapters call it when building user turns: an all-machinery
message keeps its raw parts but lands as `origin: synthetic` (hidden by the
client), embedded envelopes strip out of real text, and notify-classified
messages (background-task notices) are rewritten to a readable sentence and
surface as `origin: notification` turns. Add new patterns there, not as
ad-hoc regexes in an adapter. (Exception: OpenClaw's inbound-meta stripper
mirrors upstream code verbatim and stays in `openclaw/strip.ts`.)

Socket-protocol notes the layers rely on (all defined in `lib/types.ts`):

- **`session_renamed`** — a new thread is created under the client's temporary
  uuid, then rekeyed to the backend's real session/thread id.
- **`sessions_changed`** — a provider changed session-list metadata such as a
  generated session title; clients refresh that workspace's session list.
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
  detect.ts          which harness owns a directory — `moi init`'s auto-detection
                     (Hermes profile → OpenClaw agent → Codex → Claude Code)
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
- Internal harness metadata and helpers use session naming, including
  `sessionTitle`, `generateSessionTitle`, and `session-title.ts`. Chat naming is
  for client and UI labels. Thread naming stays at provider wire and RPC
  boundaries.
- Outside code imports only this folder's top level. Documented exceptions:
  `cli.ts` (`moi openclaw init` provisioning) imports
  `harness/openclaw/discovery.ts`; tests may import harness internals.

Current harnesses:

| Harness                 | Session module           | Adapter                  | Status                |
| ----------------------- | ------------------------ | ------------------------ | --------------------- |
| Claude Code (Agent SDK) | `claude-code/session.ts` | `claude-code/adapter.ts` | shipped, primary      |
| OpenClaw (gateway)      | `openclaw/session.ts`    | `openclaw/adapter.ts`    | shipped, experimental |
| Codex (app-server)      | `codex/session.ts`       | `codex/adapter.ts`       | shipped, experimental |
| Hermes (ACP)            | `acp/session.ts`         | `acp/adapter.ts`         | shipped, experimental |

`acp/` is the odd one out: it is **not** a harness, it is the shared
implementation of the Agent Client Protocol (stdio JSON-RPC), and `hermes/`
is the first provider built on it. Any other ACP-speaking agent (Gemini CLI,
opencode, Zed's agents) should become another thin folder next to `hermes/`
rather than a copy of the protocol. The split is:

```
acp/                  provider-agnostic protocol
  wire.ts             ACP message types (re-exported from the official SDK)
  client.ts           spawn + stdio JSON-RPC framing, one process per workspace
  adapter.ts          session/update → Turn/ToolCall (+ chunk accumulation)
  session.ts          per-session state machine, driven by AcpProviderConfig
  discovery.ts        session/list, model catalog, home-card preview
hermes/               provider specifics only
  discovery.ts        profile discovery (the importable "agents")
  index.ts            the Harness object + AcpProviderConfig
  NOTES.md            protocol research + backend quirks
```

A new ACP provider supplies an `AcpProviderConfig`: an id, the spawn spec
(binary + args), the no-prompt mode id, and whether images ride inline.

`wire.ts` re-exports the schema-generated types from
`@agentclientprotocol/sdk` — a **types-only, dev-only** dependency, since
importing values from it would pull zod in at runtime. It adds one labelled
"pre-1.0 additions" block for the model-selection surface the spec dropped and
Hermes still implements; delete that block when agents move to
`session/set_config_option`. See `hermes/NOTES.md` §12.

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
assistant turn. The Agent SDK remains the transport, while every query is
forced through the `claude` executable resolved via `executable.ts` (server
PATH merged with the login-shell PATH).
Known gaps: runs with `bypassPermissions` only (no interactive approval
flow), and effort/streaming changes require a teardown-and-resume because the
SDK has no live setter for them.

**OpenClaw — shipped.** Chat over the local gateway's WebSocket JSON-RPC
(wire protocol 4 — the 2026.7.x and 2026.6.x lines; protocol-3 gateways are
detected and surfaced, see `openclaw/compat.ts`): sessions seeded cold from
`sessions.get` then updated from live `session.message` frames (placed by the
transcript `seq` they carry, so a late row still renders in order), token-delta
previews from `chat` frames, live tool state + output from the tool stream
(`session.tool` and `agent`/tool are one payload split by audience — see
`openclaw/NOTES.md` §6 — and share one handler), run failures surfaced from the
frames that carry them, model/effort applied per send via `sessions.patch`,
abort via `sessions.abort`, per-turn usage (tokens + cost) into `TurnMeta`,
user-echo rendezvous by `<runId>:user` idempotency key (text fallback), uploads
materialized to file paths. The frame orders a live gateway produces are
replayed against the real session code by `openclaw/wire-replay.test.ts`. Known gaps: no rich vision blocks (string-only
`sessions.send`), and the gateway is the sole source of truth (no local
persistence; cold restarts re-seed).

**Hermes — shipped, experimental.** Chat over `hermes acp` (stdio JSON-RPC,
one process per workspace so `workspaceEnv` injects at spawn — `acp/client.ts`),
built on the provider-agnostic `acp/` layer. Session create/resume with temp-id
rename, `session/load` history replay, interrupt via `session/cancel`, per-turn
token usage, token streaming for thinking _and_ text, inline base64 images,
per-chat model switching from the catalog `session/new` returns inline, and
backend-generated session titles surfaced through `sessions_changed`. Agents are
Hermes **profiles** — discovered from `$HERMES_HOME`, imported with
`moi hermes init <profile>`, never created from the UI (OpenClaw's model).
Sessions run in Hermes's `dont_ask` mode to match moi's bypass-permissions trust
model. Known gaps: no mid-turn steering (moi queues instead), no subagent lanes,
no reasoning-effort control, and `session/set_model` drops session-scoped MCP
servers upstream. Two backend quirks are worked around in `acp/session.ts`:
tool calls left unsettled at turn end are closed (Hermes never completes file
read/write calls live), and a completing `tool_call_update` carries no title, so
the established name is kept. See `hermes/NOTES.md`.

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
reports a missing `codex` executable (PATH + login-shell PATH lookup, with a
Codex Desktop app-bundle fallback — `executable.ts`) to setup flows and the
workspace composer. Runs `danger-full-access` + `approvalPolicy: never`
to match moi's bypass-permissions trust model. Known gaps: no interactive
approval flow (server→client approval requests are auto-accepted
defensively), and images ride inline as data URLs only (no `localImage` path
mode).

Workspace availability also checks provider authentication when a workspace is
given. Claude Code is probed with `claude auth status` under the effective
workspace env; `claude auth login` launches its browser sign-in from the composer. Codex
uses app-server `account/read` and returns a browser OAuth URL through
`account/login/start`. The server owns the recovery loop (`server/agent.ts`):
`GET /api/workspaces/:id/agent` serves a cached availability snapshot alongside
the model catalog, `POST .../auth/login` starts (or joins) the one ceremony per
workspace, and a server-side watch loop re-probes until the login lands or times
out, pushing `agent:updated` events to every tab. The composer renders that
state; it never polls.

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
- Push health/auth status events from the backend itself (the server watch
  loop still discovers login completion by re-probing; a provider callback
  would let `agent:updated` fire without polling anywhere).

## Capability comparison

Legend: ✅ supported · ⚠️ partial/workaround · ❌ missing.

| Feature                  | Claude Agent SDK                                    | OpenClaw gateway          | Codex app-server                      | Hermes (ACP)                         |
| ------------------------ | --------------------------------------------------- | ------------------------- | ------------------------------------- | ------------------------------------ |
| Long-lived session       | ✅ subprocess per session                           | ✅ gateway-side           | ✅ server-side, N threads/process     | ✅ process per workspace, N sessions |
| Queue/steer mid-turn     | ⚠️ queued next turn                                 | ⚠️                        | ✅ `turn/steer` into live turn        | ⚠️ queued (ACP has no steer)         |
| Resume                   | ✅                                                  | ✅                        | ✅ + fork                             | ✅ `session/load` (+ fork)           |
| Interrupt                | ✅ `interrupt()`                                    | ✅                        | ✅ `turn/interrupt`                   | ✅ `session/cancel` → `cancelled`    |
| List models              | ✅ `supportedModels()`                              | ✅ `models.list`          | ✅ `model/list`                       | ✅ inline on `session/new`           |
| Live model switch        | ✅ `setModel()`                                     | ✅ `sessions.patch`       | ✅ per-turn override                  | ⚠️ drops session MCP servers         |
| Live effort switch       | ❌ rebuild                                          | ✅ `thinkingLevel` patch  | ✅ per-turn                           | ❌ no effort concept in ACP          |
| Token deltas             | ✅ opt-in                                           | ✅ `chat` frames          | ✅ `item/*/delta`                     | ✅ always on, thinking + text        |
| Images in input          | ✅ base64 blocks                                    | ⚠️ materialize to path    | ✅ data URL or path                   | ✅ base64 blocks                     |
| Interactive approvals    | ⚠️ (we bypass)                                      | ✅                        | ✅ server→client requests (we bypass) | ✅ real, with diffs (we bypass)      |
| Session list/history API | ✅ `listSessions()` + jsonl                         | ✅ `sessions.get`         | ✅ `thread/list`/`read`               | ✅ `session/list` (cwd + cursor)     |
| Home card preview        | ✅ session file scan                                | ✅ cached first message   | ⚠️ live app-server only               | ⚠️ live process only                 |
| MCP status               | ✅ `mcpServerStatus()`                              | n/a                       | ✅ `mcpServerStatus/list`             | ⚠️ per-session config, no status RPC |
| Usage reporting          | ⚠️ cost/duration on `result` (adapter drops tokens) | ✅ tokens + cost per turn | ✅ live + rate limits                 | ✅ tokens per turn                   |
| Structured output        | ❌                                                  | ❌                        | ✅ per turn                           | ❌                                   |

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
