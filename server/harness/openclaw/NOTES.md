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
against 2026.6.33). Thinking levels are gateway-global and identical on both
lines: `off minimal low medium adaptive high xhigh max` (`compat.ts`).

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
`message` carries `__openclaw` meta (see §7). Rows without `__openclaw.id`
are transient pre-envelope echoes — skip them; the durable row follows
seconds later. **`toolResult` rows DO stream here** on both lines (an earlier
version of this doc claimed they didn't); `session.tool` additionally carries
the same output live, and the run-end `sessions.get` reconcile is now just
the safety net.

**`session.tool`** — live tool state, `data.phase` `start`/`update`/`result`,
with the **full output inline on both lines**:

```jsonc
{
  "runId": "…",
  "stream": "tool",
  "sessionKey": "agent:main:main",
  "data": {
    "phase": "result", // start: name/toolCallId/args · update: +partialResult
    "name": "exec",
    "toolCallId": "toolu_01…",
    "isError": false,
    "result": {
      "content": [{ "type": "text", "text": "8" }],
      "details": { "status": "completed", "exitCode": 0, "durationMs": 255, "cwd": "/…" }
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
`{ error }`).

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
  `advertisesMethod`, `classifyGatewayError`, `messageIdempotencyKey`,
  `OPENCLAW_THINKING_LEVELS`. Read its header before sending any new param to
  the gateway.
- `discovery.ts` — agents → workspace candidates, models catalog, transcript
  seeds (2 round-trips: `agents.list` + `sessions.list`, then per-agent
  `agents.files.get(IDENTITY.md)`).
- `session.ts` — live session records: `sessions.get` seed, `session.message`
  ingest, `chat` → StreamPreview, `session.tool` → live tool cards,
  `sessions.patch` before sends, echo rendezvous, run-end reconcile.
- `adapter.ts` — gateway rows/messages → moi turns; `strip.ts` — mirror of
  upstream `strip-inbound-meta` (re-diff on every bump, see its header).

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
