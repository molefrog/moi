# OpenClaw — integration notes

Everything we learned wiring moi to OpenClaw's local gateway. Covers on-disk
layout, the WebSocket protocol, auth, the RPC surface, the live event stream,
per-version drift, the things that bit us, and how to use it from Bun.

Pinned dep: **`openclaw@2026.7.1`**. Compatibility: moi speaks gateway **wire
protocol 4**, the protocol of both the 2026.7.x and 2026.6.x lines — verified
identical for everything moi uses against live 2026.7.1 and 2026.6.33
gateways. Protocol-3 gateways (≤ 2026.5.x) reject the handshake with
`protocol mismatch` (verified live against 2026.4.22, WS close 1002); those
are detect-and-surface only (`compat.ts` → `classifyGatewayError`), never
silently degraded into empty lists.

Claims here are only as good as their last capture. §6 was rewritten in full
against live 2026.7.1 traffic from `ollama-cloud/glm-5.2:cloud`,
`openai/gpt-5.5` and `claude-cli/claude-sonnet-5`; the recordings behind it are
checked in under `fixtures/` and replayed by `wire-replay.test.ts`. Several
things this file previously asserted about backend-specific frame behavior
turned out to be artifacts of one capture on one config — see §6 and §11.

## 1. What OpenClaw is

A personal multi-channel AI assistant that runs on your own machine. The
product has several surfaces, but from an integrator's perspective there are
two components that matter:

- **The gateway** — a local service exposing a WebSocket JSON-RPC API at
  `ws://127.0.0.1:18789`. Every feature (sessions, agents, channels, config,
  approvals, memory, logs, skills, cron) is reachable through it. It's the
  single control plane.
- **The `openclaw` CLI** — a thin wrapper over the gateway's RPC methods. Most
  subcommands (`openclaw sessions`, `openclaw agents list`, `openclaw logs`)
  just open a WS connection, call one method, and format the result.

The HTTP surface at the same port (`http://127.0.0.1:18789/`) serves the
Control UI SPA and a tiny `/health` endpoint. Everything else is WebSocket.

## 2. On-disk layout

State root: `~/.openclaw/` by default. moi resolves the config the way the
CLI does: `OPENCLAW_CONFIG_PATH` wins, then `OPENCLAW_STATE_DIR/openclaw.json`
(profile runs), then `~/.openclaw/openclaw.json` (`gateway.ts →
openClawConfigPath`).

| What                                                              | Path                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Config (gateway port, auth token, agent defaults, hooks, plugins) | `~/.openclaw/openclaw.json`                                |
| Gateway HTTP+WS service                                           | launchd `ai.openclaw.gateway`, loopback                    |
| Agents (per-agent state, auth profiles, per-agent model catalog)  | `~/.openclaw/agents/<id>/agent/`                           |
| Per-agent session index                                           | `~/.openclaw/agents/<id>/sessions/sessions.json`           |
| Per-session raw event log                                         | `~/.openclaw/agents/<id>/sessions/<uuid>.jsonl`            |
| Sibling trajectory log                                            | `~/.openclaw/agents/<id>/sessions/<uuid>.trajectory.jsonl` |
| Default workspace (if agents share)                               | `~/.openclaw/workspace/`                                   |
| Memory DB                                                         | `~/.openclaw/memory/<id>.sqlite`                           |
| Device keypair (handshake signing)                                | `~/.openclaw/identity/device.json`                         |
| Issued device-auth role tokens                                    | `~/.openclaw/identity/device-auth.json`                    |
| Paired devices (control-UI, CLI, health)                          | `~/.openclaw/devices/paired.json`                          |
| Pending pairing requests                                          | `~/.openclaw/devices/pending.json`                         |

Each agent has its **own workspace dir** (override with `openclaw agents add
--workspace`) and its own agent-state dir. The default `~/.openclaw/workspace/`
is only the fallback when an agent doesn't specify one — don't assume it's
global. If you're enumerating per-agent data, **always resolve the workspace
per agent from `agents.list`**.

The session `.jsonl` record vocabulary is identical across 2026.4.x → 2026.7.x
(diffed in dist): `session`/`session_info`, `message` (roles
`user`/`assistant`/`toolResult`), `compaction`, `custom`, `custom_message`,
`model_change`, `thinking_level_change`, `branch_summary`, `label`. Content
blocks: `text`, `thinking` (+`thinkingSignature`), `toolCall`.

## 3. Auth & device pairing — the part that breaks you

Three auth concepts stack on the gateway:

1. **Gateway token** — shared secret from `openclaw.json → gateway.auth.token`.
   Required on every WebSocket connect; fail-closed by default.
2. **Device identity** — an Ed25519 keypair in `~/.openclaw/identity/device.json`.
   Signed in the `connect` handshake so the gateway knows _which_ device is
   connecting (the token is shared, the key isn't).
3. **Per-device role tokens & scopes** — each paired device holds its own
   operator-role token (`~/.openclaw/identity/device-auth.json`) with an
   approved scope set (`operator.read`, `operator.write`, `operator.admin`,
   `operator.approvals`, `operator.pairing`, `operator.talk.secrets`).

A loopback `gateway-client` in `backend` mode holding a valid gateway token
skips pairing entirely — this is moi's path, and on a fresh install it gets
full operator scopes immediately (verified in the cloud sandbox,
`docs/openclaw-sandbox.md`). The pairing dance below bites shared/remote
setups where devices start with **`operator.read` only**. When the CLI
connects with insufficient scopes the gateway emits:

```
GatewayClientRequestError: scope upgrade pending approval (requestId: <uuid>)
```

and writes a record to `~/.openclaw/devices/pending.json`.

### The approval dance (chicken-and-egg)

You **cannot approve a scope upgrade from the same CLI device that's asking
for it** — `openclaw devices approve <id>` itself needs `operator.admin`, which
you don't have yet, so it spawns another pending request with a new ID. Each
retry generates a fresh ID, so copy-pasting an old one returns `unknown
requestId`.

Resolution paths, in order of practicality:

1. **Approve from the Control UI** (`http://127.0.0.1:18789/`). The browser is
   usually already paired with full operator scopes. One click in the Devices
   panel approves the latest pending request.
2. **Approve from another already-paired device** holding admin scopes.
3. **Revoke the current read-only CLI pairing** so it re-pairs from scratch.

Once approved, the role token in `device-auth.json` is upgraded in place.

### Fallback behavior of the CLI

Most `openclaw` subcommands that need RPC have a local-file fallback: if the
gateway refuses the connection, they read `~/.openclaw/…` directly (`openclaw
sessions`, `openclaw status`, `openclaw agents list`, `openclaw logs`). Watch
for the "Direct scope access failed; using local fallback" banner when
debugging — those commands may never have hit the gateway.

## 4. Handshake and hello-ok

The server pushes `connect.challenge {nonce, ts}` on socket open; the client's
first frame must be a `connect` request. On success the response payload is
(observed live on both lines):

```jsonc
{
  "type": "hello-ok",
  "protocol": 4,
  "server": { "version": "2026.7.1", "connId": "<uuid>" },
  "features": {
    "methods": ["..."], // 218 on 2026.7.1, 193 on 2026.6.33
    "events": ["..."], // 30 / 27
    "capabilities": ["chat-send-routing-contract"] // 2026.7.x only
  },
  "snapshot": {
    "presence": [],
    "health": {},
    "uptimeMs": 0,
    "sessionDefaults": {},
    "authMode": "token"
  },
  "auth": { "role": "operator", "scopes": ["..."] },
  "policy": { "maxPayload": 26214400, "maxBufferedBytes": 52428800, "tickIntervalMs": 30000 }
}
```

**`features.methods` UNDER-REPORTS.** Methods registered with
`advertise:false` (`sessions.get`, `sessions.resolve`, `sessions.usage*`) are
omitted yet fully callable — both live gateways omit `sessions.get` from
`features.methods` and still answer it (verified live against 2026.7.1 /
2026.6.33). Treat the list as advisory: gate optional niceties on it, never an
essential call (`compat.ts → advertisesMethod`).

Rule for params in the other direction: gateways validate with
`additionalProperties: false` and hard-reject unknown fields, so never send a
param that only newer schemas know without gating on the announced version
(e.g. `sessions.list {archived}` and `sessions.create {fork, worktree}` are
2026.7.x-only).

## 5. RPC surface

Methods moi uses, all present and shape-identical on both supported lines:
`agents.list` · `agents.files.get` · `models.list` · `sessions.list` ·
`sessions.get` · `sessions.resolve` · `sessions.create` · `sessions.send` ·
`sessions.steer` · `sessions.abort` · `sessions.patch` ·
`sessions.subscribe`/`unsubscribe` · `sessions.messages.subscribe`/
`unsubscribe`. Also there: `sessions.preview`, `sessions.compact`,
`chat.history`, `cron.list`, `cron.runs`, and many more.

### Gotchas in params

- **`sessions.list`** accepts `limit`, `offset`, `activeMinutes`,
  `includeGlobal`, `includeUnknown`, `configuredAgentsOnly`,
  `includeDerivedTitles`, `includeLastMessage`, `label`, `spawnedBy`,
  `agentId`, `search` (+`archived` on 2026.7.x) — **not** `allAgents` (the CLI
  flag is client-side aggregation). Pass `includeGlobal: true` to aggregate.
- **`sessions.get`** takes `{ key | sessionKey, limit?, agentId? }` (no strict
  schema) → `{ messages }`; unknown keys return `{ messages: [] }`, not an
  error. `sessions.preview({ keys, limit, maxChars })` returns `{ role, text }`
  items but caps around 11 — use `sessions.get` for transcripts.
- **`agents.list`** accepts **no** extra params. The row is richer than it
  used to be — `{ id, workspace, workspaceGit, agentRuntime, thinkingLevels,
thinkingOptions, thinkingDefault, model }` (verified live) — but identity
  (`identityName`, emoji, bindings) is still CLI-enriched; fetch
  `agents.files.get({ agentId, name: 'IDENTITY.md' })` yourself.
- **`agents.files.get`** uses `{ agentId, name }` — not `{ id, path }`.
- Scope errors return `INVALID_REQUEST` or `scope upgrade pending approval`
  depending on the method's required scope.

### sessions.patch

Params (`additionalProperties: false`): `key` (+`agentId`) plus any of
`label`, `category`, `archived`, `pinned`, `unread`, `thinkingLevel`,
`fastMode`, `verboseLevel`, `traceLevel`, `reasoningLevel`, `responseUsage`,
`elevatedLevel`, `execHost`/`execSecurity`/`execAsk`/`execNode`, `model`,
`spawnedBy`, `spawnedWorkspaceDir`, `spawnedCwd`, `spawnDepth`,
`subagentRole`, `subagentControlScope`, `inheritedToolAllow`/`Deny`,
`sendPolicy`, `groupActivation`. Write scope covers the organizational fields
(`label`, `category`, `pinned`, `archived`, `unread`); the rest needs admin.

`{ model, thinkingLevel }` is how moi applies the picker before each send
(both lines, verified live). The config's `agents.defaults.models` map is a
**model allowlist**: patching to a model outside it is rejected with
`INVALID_REQUEST` `model not allowed: <provider>/<model>` (verified live
against 2026.6.33).

#### Never patch the model straight into a send

`sessions.patch { model }` is **not** a session-local write: OpenClaw persists
the pick into the agent's effective `model.primary`, and that config write
bumps the prepared-model-runtime generation. A run admitted inside that window
is superseded and dies **during admission** — `sessions.send` still answers
`status: 'started'` with a runId, and the only thing that follows is
`sessions.changed { reason: 'chat.dispatch-error' }` (no runId to match on).

Captured on the wire against 2026.7.2-beta.7, first message of a new chat:

```
14:49:47.901  SEND sessions.patch { model, thinkingLevel, reasoningLevel }
14:49:47.930  RESP patch ok
14:49:47.930  SEND sessions.send            ← same millisecond
14:49:47.946  RESP send  status=started runId=88a7701d
14:49:49.959  EVT  sessions.changed reason=chat.dispatch-error   ← run dead, 2.0s later
14:49:58.641  SEND sessions.send (user resent)  → ran fine
```

The resend works because the model is already applied, so there is no second
config write. That is the whole shape of the bug: **first message of a new
chat fails, second always works.**

So moi carries the model **in `sessions.create`** instead (`session.ts →
sendOpenClawMessageImpl`) and marks it applied on the record so
`applySessionSettings` skips the model patch. Note the asymmetry that decides
what may ride along on create:

| create param    | 2026.6.x | 2026.7.x |
| --------------- | -------- | -------- |
| `model`         | yes      | yes      |
| `thinkingLevel` | **no**   | yes      |

Both lines validate create with `additionalProperties: false`, so passing
`thinkingLevel` there would hard-reject **every new chat** on 2026.6.x. Effort
stays a patch — it is session-scoped, writes no config, and so cannot supersede
a run. Only the model ever needed moving.

**Thinking levels are per model, not gateway-global** (an earlier version of
this doc claimed otherwise and moi shipped one static list because of it).
The gateway resolves the menu from per-provider policies in the dist
(`provider-claude-thinking`, `moonshot-thinking`, …) and validates
`thinkingLevel` against the session's _resolved_ model, rejecting by name:

```
thinkingLevel "adaptive" is not supported for openai/gpt-5.6-sol
  (use off|minimal|low|medium|high|xhigh|max|ultra)
thinkingLevel "minimal" is not supported for ollama/deepseek-v4-flash:cloud
  (use off|low|medium|high|max)
```

Menus captured live from `sessions.list` rows on 2026.7.1-2:

| model                          | thinkingOptions                                    | default |
| ------------------------------ | -------------------------------------------------- | ------- |
| openai/gpt-5.6-sol             | off minimal low medium high xhigh max **ultra**    | low     |
| openai/gpt-5.6-terra           | off minimal low medium high xhigh max **ultra**    | medium  |
| openai/gpt-5.6-luna            | off minimal low medium high xhigh max              | medium  |
| anthropic/claude-opus-4-8      | off minimal low medium **adaptive** high xhigh max | off     |
| ollama/kimi-k3:cloud           | off low medium high max                            | off     |
| ollama/deepseek-v4-flash:cloud | off low medium high max                            | off     |
| openai/kimi-k3:cloud           | off minimal low medium high                        | off     |

So `adaptive` is Claude-only, `ultra` is OpenAI-only (and absent from luna),
the ollama models drop `minimal`/`xhigh`, and the same model id under two
providers gets two different menus. `thinkingDefault` varies too.

`models.list` carries only `reasoning: boolean` — no levels — **and even that
flag is not dependable**: on 2026.7.2-beta.7 the OpenAI rows come back with
`reasoning: undefined` while their session rows still advertise the full
`off…ultra` menu (verified live). Gating the effort picker on the flag alone
therefore makes it vanish for every GPT model on that line, so
`getOpenClawModels` also accepts a learned menu with more than one level as
proof the model reasons. There is no per-model thinking RPC either (`models.get`/`models.capabilities` don't exist;
`models.list` hard-rejects an `agentId` param). Every **session row** does
carry the resolved menu, so `thinking.ts` harvests rows (discovery
`sessions.list` + the row embedded in every live frame) into a per-model map
that feeds the picker, and relearns a model's menu from a rejection message
when one slips through. Models with no row yet fall back to the
cross-provider intersection `off low medium high`.

### reasoningLevel — the gate on reasoning output

`sessions.patch { reasoningLevel: 'off' | 'on' | 'stream' }`, **default
`off`**. In the dist, `reasoningMode = reasoningLevel ?? 'off'` and then
`includeReasoning: reasoningMode === 'on'`, `streamReasoning: reasoningMode
=== 'stream'`, both further gated on `canShowReasoning = thinkingLevel !==
'off'`. moi patches `reasoningLevel: 'stream'` whenever the picked effort is
not `off`, so a provider that can surface reasoning does.

Necessary but not sufficient — see §6 for which backends actually carry the
text. Note the side effect on a session that also serves a channel (a
Telegram-routed `agent:<a>:main`): reasoning mode is a session property, so
raising it changes what that channel streams too.

Config edits hot-reload where possible: the gateway watches `openclaw.json`
and logs `config hot reload applied (…)` vs `requires gateway restart (…)`
per key; CLI config writes print `Gateway restart required` when a key
doesn't hot-apply. Don't assume every config write needs a restart anymore —
but model-auth changes still resolve at startup.

### Detecting running sessions

`sessions.list` rows include `status` + `startedAt` / `endedAt` / `runtimeMs`
once a session has had at least one gateway run. `status === 'running'` is
the live discriminator; `abortedLastRun: true` means the last run was killed.
Rows for never-run sessions omit these fields entirely.

### Stopping a run

`sessions.abort({ key, runId? })`. Pass the specific `runId` to kill a
particular run; omit it to kill whatever's active. Returns `{ ok: true,
abortedRunId, status: 'aborted' | 'no-active-run' }`. `sessions.steer` is
`sessions.send` that interrupts the active run first (response carries
`interruptedActiveRun`).

## 6. Live events

One WebSocket connection: `sessions.subscribe({})` for the agent-wide
firehose, `sessions.messages.subscribe({ key })` per session. Events arrive
as `{ type: 'event', event, payload, seq? }` frames. moi refcounts the
per-session subscriptions (`gateway.ts`): the first live record subscribes a
key, later records reuse it, and the last one to tear down (idle eviction or
shutdown) `sessions.messages.unsubscribe({ key })`s it — best-effort, since a
dropped socket already unsubscribes server-side. On reconnect it re-subscribes
every key that still has a live holder. **Every session-scoped
event embeds a fresh session row** (`payload.session` and/or flattened
fields): `model`/`modelProvider`, `thinkingLevel` (+`thinkingLevels`),
`inputTokens`/`outputTokens`/`totalTokens`, `estimatedCostUsd`, `status`,
`origin`, `contextTokens`, `contextBudgetStatus.shouldCompact` — a free
state sync on every frame.

Families we consume (skeletons from live captures; wire shapes identical on
2026.7.1 and 2026.6.33 unless noted):

**`chat`** — token streaming. `message` is the cumulative partial (full
content blocks), `deltaText` just the increment:

```jsonc
{
  "runId": "…",
  "sessionKey": "agent:main:main",
  "seq": 6,
  "state": "delta", // delta | final | error | aborted
  "deltaText": " moon is …",
  "message": {
    "role": "assistant",
    "content": [{ "type": "text", "text": "The moon is …" }],
    "timestamp": 0
  },
  "stopReason": "stop", // final/aborted ("rpc" on a steer interrupt)
  "errorMessage": "…"
} // error only
```

**`session.message`** — durable transcript rows, pushed as they commit. The
`message` carries `__openclaw` meta (see §7), including **`seq` — the row's
position in the transcript**, mirrored as a top-level `messageSeq`. That number
is the only ordering authority: the gateway serializes its broadcasts behind a
promise queue (`server-session-events.ts` → `createTranscriptUpdateBroadcastHandler`,
"Preserve transcript update order even when counting messages requires an async
read"), but a frame can still be lost to a dropped socket and arrive later via
the reconcile. moi carries `seq` onto `Turn.seq`, and `lib/format.ts`
`applyEvent` places a new turn by it, so a late row lands where it belongs
rather than after the reply it preceded.

Rows without `__openclaw.id` are transient pre-envelope echoes — skip them; the
durable row follows.

Two things about this stream are easy to get wrong, and both were (verified
live on 2026.7.1 against `ollama-cloud/glm-5.2:cloud` and `openai/gpt-5.5`,
captures checked in under `fixtures/`):

- **`toolResult` rows do NOT stream.** In every capture the transcript ends up
  with `user(1) · assistant(2) · toolResult(3) · assistant(4)` and the frames
  delivered are seq 1, 2 and 4 — never 3. A tool's output reaches us live only
  on the tool stream below; the run-end `sessions.get` reconcile is the
  backstop, not a nicety.
- **A row can grow after it streams.** When a model fans out several calls at
  once, the assistant row is pushed as text and its `toolCall` blocks are
  attached afterwards, with no second frame. The live view therefore has a row
  the transcript disagrees with, which is why the reconcile refreshes rows whose
  content changed instead of only adopting ids it has never seen.

**`session.tool` and `agent`/`tool` are the same payload, split by audience —
not by backend.** This is the single most important fact about this stream, and
believing otherwise is what produced every duplicate-card bug this harness has
shipped. From `server-chat.ts`: the gateway sends `agent`/`tool` to the
connections registered as run-scoped tool recipients — the connection that
issued `sessions.send` — and mirrors the identical payload as `session.tool` to
every _other_ session subscriber, `excludeConnIds(sessionEventSubscribers,
runToolRecipients)`. The two audiences are disjoint by construction.

Demonstrated directly: two connections, same gateway, same run, one sends and
one only subscribes.

```
sender  : agent/tool:start, agent/tool:update, agent/tool:result
observer: session.tool:start, session.tool:update, session.tool:result
```

So moi sees `agent`/`tool` for runs it starts and `session.tool` for everything
else — a channel message, a cron firing, another client, or a run already in
flight when it attached. `session.ts` routes both into one `handleToolFrame`.
Frame shape (`data.phase` `start`/`update`/`result`, full output inline):

```jsonc
{
  "runId": "…",
  "stream": "tool",
  "sessionKey": "agent:main:main",
  "data": {
    "phase": "result", // start: name/toolCallId/args · update: +partialResult
    "name": "exec",
    "toolCallId": "call_y42lj8xv",
    "isError": false,
    "result": {
      "content": [{ "type": "text", "text": "hello" }],
      "details": { "status": "completed", "exitCode": 0, "durationMs": 228, "cwd": "/…" }
    }
  },
  "session": {
    /* fresh row */
  }
}
```

**`agent`** — the raw run stream `{ runId, stream, seq, ts, data }`;
`stream` values: `assistant` (`{ text, delta }`, cumulative + increment;
`thinking` likewise), `item` (tool/item lifecycle `{ itemId, phase:
start|update|end, kind, status, name, toolCallId }`), `command_output`
(`{ output, phase: delta|end, exitCode?, durationMs?, cwd? }`), `lifecycle`
(phases `start` → `finishing` `{ stopReason, aborted }` → `end`, or `error`
`{ error }`, plus `fallback_step` when a model chain retries).

### Who owns a tool card

The durable owner row and the tool `start` frame race, and which wins decides
what renders. Measured on both providers, single call:

```
11891  session.message  assistant seq=2  blocks=toolCall   ← owner commits first
11895  agent/tool       phase=start      call_y42lj8xv     ← 4ms later
11936  agent/tool       phase=result     call_y42lj8xv
13638  session.message  assistant seq=4  blocks=text
```

and the same run with three calls fanned out of one row:

```
30822  session.message  assistant seq=2  blocks=text       ← no toolCall blocks
30827  agent/tool       phase=start      call_d88i21w1     ← the only evidence
30831  agent/tool       phase=start      call_0f2nwkab        these calls exist
30835  agent/tool       phase=start      call_p7i1myi5
34796  session.message  assistant seq=6  blocks=text
```

So the rule is a question about the run, not about the backend: **does a
durable row own this call yet?** If yes, that row renders the card and the
frames only fill in its state. If no, the frame gets a card of its own
(`livetool:<toolCallId>`), placed just past the last durable row we ingested,
and it keeps that call for the rest of the session — durable rows that later
grow the same `toolCall` block suppress it (adapter `omitToolCallIds`).
Ownership is decided once, when the card is created: `applyEvent` upserts by id
and can never retract, so a card that changes identity mid-run is a duplicate
on screen forever. That is exactly the bug the old "is this the codex backend?"
sniffing produced — the owner row arrived 4ms first, the start frame then
re-ided the already-broadcast turn onto a `livetool:` id, and every single-tool
run rendered the call twice, once stuck pending.

Tool ids were stable across `start`/`update`/`result`/durable in every capture,
on both providers.

**Run failures are reported on three frames and moi must show them.** A dying
run says why on `chat` `state:'error'` (`errorMessage`), on `agent`/`lifecycle`
`phase:'error'` (`data.error`), and as a bare `sessions.changed phase:'error'`
with no text at all. The wordings differ (the raw reason, then a wrapped
"⚠️ Agent failed before reply: … Logs: openclaw logs --follow"), so
`reportRunError` reports the first that carries text and drops the rest for
that run. Note the error frames arrive on `chat`, which moi otherwise ignores
when token streaming is off — failures are surfaced regardless of that toggle,
or a run that dies with streaming off looks like nothing happened.

**Thinking blocks: who actually emits them.** The wire shape exists and moi
renders it — durable rows carry `{ type: 'thinking', thinking,
thinkingSignature }` and `adapter.ts` maps it to a `reasoning` part. What varies
is whether a model produces one at all, and this varies by MODEL and by the
config it runs under, not by a fixed backend taxonomy. Measured on 2026.7.1
with the default config (`fixtures/`):

| model                        | reasoning on the wire                                      | text? |
| ---------------------------- | ---------------------------------------------------------- | ----- |
| `openai/gpt-5.5`             | `agent`/`thinking` deltas, then a durable `thinking` block | YES   |
| `ollama-cloud/glm-5.2:cloud` | nothing — the model writes its reasoning as plain text     | n/a   |

An earlier revision of this file claimed OpenAI models route through a codex
app-server that never carries reasoning text. That is not what the default
config does on 2026.7.1: `openai/gpt-5.5` streams the words on `agent`/`thinking`
and commits them durably, and no `codex_app_server.*` frame appears anywhere in
the capture. (`models status` reporting "openai via codex" is about which auth
store the credential comes from, not which runtime serves the turn.) Treat
"which runtime is behind this model" as a config question, not something to
infer from frames — and never gate rendering on the answer.

`reasoningLevel` (§5) stays set whenever the picked effort is not `off`: it is
the gateway's documented gate (`reasoningMode = reasoningLevel ?? 'off'`,
further gated on `canShowReasoning = thinkingLevel !== 'off'`), and a model that
can surface reasoning needs it.

Some runtimes report reasoning only as an `agent`/`item` frame of
`kind:'analysis'` — presence and timing, no text. `session.ts →
handleReasoningItemFrame` turns that into a textless `{ type: 'reasoning',
text: '', redacted: true, durationMs }` part, so such a run shows "Thinking" →
"Thought for 1.1s" instead of a silent gap. Like the live tool cards it is not
durable — nothing in the transcript backs it, so a cold reload drops the row.

**`task`** — subagent runs (2026.7.x; the event family is new there):

```jsonc
{
  "action": "upserted",
  "task": {
    "kind": "subagent",
    "status": "running", // → completed
    "title": "…",
    "sessionKey": "agent:main:main",
    "childSessionKey": "agent:main:subagent:<uuid>",
    "runId": "…"
  }
}
```

**`session.operation`** — compaction:
`{ operationId, operation: 'compact', phase: 'start' | 'end', sessionKey,
completed?, ts }`.

**`presence` / `health`** — connected-device roster and a rich gateway
health blob (`eventLoop`, `plugins`, `channels`, `sessions`); useful for
liveness, ignored otherwise. `tick` is the heartbeat.

### `sessions.changed`

Two flavors share the event name (both lines, verified live):

- **Run lifecycle**: `{ phase: 'start' | 'end' | 'error', runId, …row }` —
  drives the busy flag.
- **Mutations**: `{ reason, …row }`. Observed live: `send`, `steer`,
  `create`, `patch`, `compact`, `subagent-status`; the dist also emits
  `new`, `delete`, `abort`, `cleanup` and friends — treat the set as open.
  **`chat.title` is 2026.7.x-only** — zero emit sites in the 2026.6.33 dist,
  so title refreshes on 6.x ride the other reasons.

## 7. Durable-row drift between the lines

Where 2026.7.x and 2026.6.x rows actually differ for us (all verified live
via `sessions.get` + `session.message` frames on both gateways):

| Field                                      | 2026.7.x                                                | 2026.6.x                                                     |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| `<runId>:user` send idempotency key        | `__openclaw.idempotencyKey` (+ mirrored on the message) | message-level `idempotencyKey` only                          |
| `__openclaw.senderIsOwner`                 | on user rows (`false` = channel inbound)                | absent                                                       |
| `__openclaw.id`                            | 8-hex short hash                                        | short hash on agent rows, uuid seen on gateway-injected rows |
| assistant `responseId` (`msg_…`) + `model` | both                                                    | both                                                         |

Treat `__openclaw.id` as an opaque string. `compat.ts →
messageIdempotencyKey` reads nested-then-flat so the user-echo rendezvous
matches on either line; text matching stays as the fallback.

## 8. Cron sessions

Anatomy (verified live against 2026.7.1): the job's session key is
`agent:<a>:cron:<jobId>` with label/displayName `Cron: <name>`; every firing
runs under a per-run key `agent:<a>:cron:<jobId>:run:<uuid>` with its own
`sessionId` (visible in `cron.runs` entries). The post-run session reset
**orphans the per-run transcript file** — `sessions.get` AND `chat.history`
return 0 messages for both the job key and the run key (verified live). The
readable record is `cron.runs`: entries carry `{ ts, jobId, action, status:
'ok' | 'error', summary, runId, durationMs, model, usage, sessionKey,
error? }`. Don't build cron transcript views on the session APIs.

## 9. Channel routing

With default routing an inbound channel DM (IRC, Telegram, …) lands in the
agent's **main** session `agent:<a>:main` — no new session. Verified live
against 2026.7.1 with a loopback IRC channel:

- The session row's `channel`/`lastChannel` flip to the provider and `origin`
  absorbs the peer identity: `{ label: 'mole!mole@127.0.0.1', from:
'irc:mole!mole@127.0.0.1', to: 'irc:mole' }`; `deliveryContext` records the
  reply route.
- `displayName` becomes the peer identity string — which **hijacks title
  precedence** (label > displayName > derivedTitle > preview), so the chat
  list suddenly shows `mole!mole@127.0.0.1` instead of the derived title.
- Per-message provenance is minimal: the inbound user row carries only
  `__openclaw.senderIsOwner: false` (2026.7.x; 6.x rows have no marker), plus
  the strippable inbound-metadata envelope in the text (see `strip.ts`).

## 10. Using the `openclaw` npm package

**Don't roll your own WS client.** The `openclaw` package publishes a
supported subpath export:

```ts
import { GatewayClient } from 'openclaw/plugin-sdk/gateway-runtime'
```

`GatewayClient` handles device-identity loading & signing, token auth, the
challenge-response handshake, reconnect backoff, heartbeat watch, and per-RPC
timeouts. `opts` is private — connect callbacks go to the constructor
(that's true on every version we support, not just 2026.7.x):

```ts
const client = new GatewayClient({
  url: `ws://127.0.0.1:${port}`,
  token, // from openclaw.json gateway.auth.token
  role: 'operator',
  scopes: ['operator.admin', 'operator.read', 'operator.write'],
  // REQUIRED for live tool cards: the gateway registers a connection as a
  // tool-event recipient only when it advertises this cap. Omit it and
  // `session.tool` frames never arrive (the SDK defaults `caps` to `[]`).
  caps: ['tool-events'],
  // moi speaks wire protocol 4 (compat.ts). The SDK already defaults both to 4,
  // so pinning them is self-documenting, not a behavior change.
  minProtocol: 4,
  maxProtocol: 4,
  requestTimeoutMs: 2000,
  onHelloOk: hello => {
    /* parseHelloOk(hello) → GatewayInfo */
  },
  onConnectError: err => {
    /* classifyGatewayError(err) */
  },
  onEvent: evt => {
    /* { event, payload } frames */
  }
})
client.start()
const result = await client.request('sessions.list', { includeGlobal: true })
client.stop()
```

moi builds these shared options once in `gateway.ts → gatewayClientBaseOptions`
and spreads them into both the persistent streaming client and the one-shot
discovery client, so both advertise `caps: ['tool-events']`.

Important: **always wrap `connect` in your own timeout**. `GatewayClient`
doesn't enforce one on the initial handshake (only on individual RPCs), so a
silent gateway will hang forever. We race a 2–5 s timer.

The package is **big** (~300+ transitive deps — channel plugins, provider
SDKs, the full CLI). For our case (the server already has lots of deps) the
subpath import wins over rolling a minimal client.

## 11. What our code does

`server/harness/openclaw/` — the harness. Module map:

- `gateway.ts` — one process-global `GatewayClient` (reconnect, subscription
  replay, wire tap), config-path resolution, one-shot client for discovery,
  and the last connect outcome for `/status` (`getOpenClawGatewayStatus`).
- `compat.ts` — protocol-4 tolerance layer: `parseHelloOk`,
  `advertisesMethod`, `classifyGatewayError`, `messageIdempotencyKey`. Read
  its header before sending any new param to the gateway.
- `thinking.ts` — per-model thinking menus learned from session rows, plus the
  relearn-from-rejection path. The effort picker reads it (§5).
- `discovery.ts` — agents → workspace candidates, models catalog, transcript
  seeds (2 round-trips: `agents.list` + `sessions.list`, then per-agent
  `agents.files.get(IDENTITY.md)`).
- `session.ts` — live session records: `sessions.get` seed, `session.message`
  ingest, `chat` → StreamPreview, tool frames → tool cards, `sessions.patch`
  before sends, echo rendezvous, run-end reconcile, run-error reporting.
- `adapter.ts` — gateway rows/messages → moi turns; `strip.ts` — mirror of
  upstream `strip-inbound-meta` (re-diff on every bump, see its header).
- `fixtures/*.jsonl` + `wire-replay.test.ts` — recorded gateway traffic, one
  chat turn per file, replayed through the real session code. **Add a capture
  before changing how frames are interpreted.** Every ordering and duplication
  bug this harness has shipped came from reasoning about frame order in the
  abstract; a recording is the only thing that argues back. The capture script
  is in `docs/openclaw-sandbox.md`.

Two rules the modules above depend on, both learned the hard way:

1. **Never branch on "which backend is this".** The frame families that look
   backend-specific are audience-specific (§6), and which runtime serves a
   model is a config choice. Ask about the state you actually have — does a
   durable row own this call? — not about who is on the other end.
2. **A broadcast turn can be upserted but never retracted.** Any id a turn is
   published under is permanent. Decide identity once, at creation.

## 12. Commands worth knowing

```
openclaw status                         # overview (gateway, agents, sessions, security)
openclaw agents list [--json]           # agents + workspaces + bindings (CLI-enriched)
openclaw sessions --all-agents --json   # aggregate sessions across agents (uses RPC)
openclaw logs --follow --json           # tail gateway logs (WS if scoped, else /tmp file)
openclaw cron list --all                # cron jobs incl. disabled; `cron runs` for history
openclaw devices list                   # pending + paired devices
openclaw devices approve <requestId>    # needs admin scope (chicken-and-egg, see §3)
openclaw doctor                         # lint config, flag risky dm policies
openclaw dashboard                      # open Control UI with token in URL
```

`openclaw --dev` runs a completely isolated instance under `~/.openclaw-dev/`
on port `19001`. Same for `--profile <name>` (`~/.openclaw-<name>/`) — the
multi-version test rig in `docs/openclaw-sandbox.md` is built on profiles.
