# OpenClaw — integration notes

Everything we learned wiring the workspace-discovery flow to OpenClaw's local
gateway. Covers on-disk layout, the WebSocket protocol, auth, the RPC surface,
the things that bit us, and how to use it from Bun.

Pinned version (known good): **`openclaw@2026.4.22`** — this is the one our
code and these notes were verified against.

## 1. What OpenClaw is

A personal multi-channel AI assistant that runs on your own machine. The
product has several surfaces, but from an integrator's perspective there are
two components that matter:

- **The gateway** — a local service exposing a WebSocket JSON-RPC API at
  `ws://127.0.0.1:18789`. Every feature (sessions, agents, channels, config,
  approvals, memory, logs, skills) is reachable through it. It's the single
  control plane.
- **The `openclaw` CLI** — a thin wrapper over the gateway's RPC methods. Most
  subcommands (`openclaw sessions`, `openclaw agents list`, `openclaw logs`)
  just open a WS connection, call one method, and format the result.

The HTTP surface at the same port (`http://127.0.0.1:18789/`) serves the
Control UI SPA and a tiny `/health` endpoint. Everything else is WebSocket.

## 2. On-disk layout

State root: `~/.openclaw/`.

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

Each agent has its **own workspace dir** (override with `openclaw agents add --workspace`)
and its own agent-state dir. The default `~/.openclaw/workspace/` is only the
fallback when an agent doesn't specify one — don't assume it's global. If you're
enumerating per-agent data (widgets, local files), **always resolve the workspace
per agent from `agents.list`**, not from the default.

### Session `.jsonl` schema

Each line is one event. Types seen in the wild (from a fresh agent run):

```
session              { version, id, cwd, timestamp }
model_change         { provider, modelId }
thinking_level_change{ thinkingLevel }
custom               { customType, data }    ← OpenClaw's synthetic-event channel
message              { role: 'user'|'assistant', content: [...] }
toolResult           message-shaped with tool output
```

The sibling `<uuid>.trajectory.jsonl` carries lifecycle events:
`session.started`, `context.compiled`, `prompt.submitted`, `model.completed`,
`trace.metadata`, `trace.artifacts`, `session.ended`.

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

A fresh CLI device starts with **`operator.read` only**. Almost every useful
method (`sessions.list`, `sessions.subscribe`, `logs.tail`, `agents.files.get`,
admin actions) needs at least `operator.read` + `operator.write`, and most of
them need `operator.admin`. When the CLI connects with insufficient scopes the
gateway emits:

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
   usually already paired as `openclaw-control-ui / webchat` with full
   operator scopes — its keypair lives in the browser's IndexedDB. One click
   in the Devices panel approves the latest pending request.
2. **Approve from another already-paired device** holding admin scopes, using
   its device token.
3. **Revoke the current read-only CLI pairing** so it re-pairs from scratch;
   the fresh pairing shows up as a new request the browser can approve.

Once approved, the role token in `device-auth.json` gets upgraded in place. No
config changes needed.

### Fallback behavior of the CLI

Most `openclaw` subcommands that need RPC have a local-file fallback: if the
gateway refuses the connection, they read `~/.openclaw/…` directly. `openclaw
sessions`, `openclaw status`, `openclaw agents list`, `openclaw logs` all do
this. That's why those commands kept working for us before the scope upgrade
was approved — they were never hitting the gateway, they were scraping disk.
Useful to know when you're debugging: see the "Direct scope access failed;
using local fallback" banner.

## 4. RPC surface

Full method list (surfaced from `method-scopes-*.js` but verified by calling
them live):

**Sessions.** `sessions.list` · `sessions.resolve` · `sessions.preview` ·
`sessions.get` · `sessions.messages.subscribe` / `unsubscribe` ·
`sessions.subscribe` / `unsubscribe` · `sessions.send` · `sessions.patch` ·
`sessions.abort` · `sessions.steer` · `sessions.create` · `sessions.reset` ·
`sessions.delete` · `sessions.compact` ·
`sessions.compaction.{list,get,branch,restore}` · `sessions.usage` ·
`sessions.usage.{logs,timeseries}`.

**Agents.** `agents.list` · `agents.create` · `agents.update` · `agents.delete` ·
`agents.files.{list,get,set}`.

**Config/logs.** `config.get` · `config.schema.lookup` · `logs.tail`.

Live over the `openclaw.control-ui` webchat device we also observed
`channels.status`, `skills.status`, `sessions.usage` — there are many more
outside the integration surface we touched.

### Gotchas in params

- **`sessions.list`** accepts `limit`, `activeMinutes`, `includeGlobal`,
  `includeUnknown`, `includeDerivedTitles`, `includeLastMessage`, `label`,
  `spawnedBy`, `agentId`, `search` — **not** `allAgents` (the CLI flag is
  client-side aggregation). Pass `includeGlobal: true` to aggregate.
- **`sessions.get`** exists in the method list, but for reading _messages_
  what you want is `sessions.preview({ keys: [...], limit, maxChars })` which
  returns structured `{ role, text }` items, or `sessions.messages.subscribe`
  for a live stream.
- **`agents.list`** accepts **no** extra params. All the identity enrichment
  you see in `openclaw agents list --json` (`identityName`, `identityEmoji`,
  `agentDir`, `bindings`, `isDefault`, `routes`) is computed client-side by
  the CLI — the gateway returns `{ defaultId, mainKey, scope, agents: [{ id,
workspace, model }] }`. Short response.
- **`agents.files.get`** uses `{ agentId, name }` — not `{ id, path }`. Easy
  to get wrong.
- Scope errors return `INVALID_REQUEST` or `scope upgrade pending approval`
  depending on the method's required scope.

### Detecting running sessions

`sessions.list` rows include `status` + `startedAt` / `endedAt` / `runtimeMs`
once a session has had at least one gateway run. `status === 'running'` is
the live discriminator; `abortedLastRun: true` means the last run was killed.
Rows for never-run sessions (`tui-...`) omit these fields entirely — don't
assume they're present.

### Live updates

One WebSocket connection, `sessions.subscribe({})` for top-level session
events, `sessions.messages.subscribe({ key })` for per-thread message events.
Events arrive on the same socket as pushed `event` frames of shape
`{ type: 'event', event: '<name>', payload: {...} }`. Unsubscribe symmetrically.
No long-polling, no second connection.

### Stopping a run

`sessions.abort({ key, runId? })`. Pass the specific `runId` from a subscribe
frame to kill a particular run; omit it to kill whatever's active. Returns
`{ ok: true, abortedRunId, status: 'aborted'|'no-active-run' }`.

## 5. Using the `openclaw` npm package

**Don't roll your own WS client** unless you have a reason. The `openclaw`
package publishes a supported subpath export that's declared in its
`package.json` `exports` map:

```ts
import { GatewayClient } from 'openclaw/plugin-sdk/gateway-runtime'
```

Also available at the same path: `createOperatorApprovalsGatewayClient`,
`withOperatorApprovalsGatewayClient`, the `EventFrame` protocol type.

`GatewayClient` handles:

- Ed25519 device-identity loading & challenge signing
- Token / password / deviceToken auth resolution
- Challenge-response handshake with nonce
- Reconnect with exponential backoff
- Heartbeat tick watch
- TLS fingerprint pinning (for `wss://`)
- Request timeout (`requestTimeoutMs`)

Minimal client (what `server/openclaw.ts` uses):

```ts
import { GatewayClient } from 'openclaw/plugin-sdk/gateway-runtime'

const client = new GatewayClient({
  url: `ws://127.0.0.1:${port}`,
  token, // from openclaw.json gateway.auth.token
  role: 'operator',
  scopes: ['operator.admin', 'operator.read', 'operator.write'],
  requestTimeoutMs: 2000
})

await new Promise<void>((res, rej) => {
  client.opts.onHelloOk = () => res()
  client.opts.onConnectError = rej
  client.start()
})

const result = await client.request('sessions.list', { includeGlobal: true })
client.stop()
```

Important: **always wrap `connect` in your own timeout**. `GatewayClient`
doesn't enforce one on the initial handshake (only on individual RPCs), so a
silent gateway will hang forever. We use `Promise.race` with a 2 s timer.

### The dependency footprint

The `openclaw` package is **big** (~300+ transitive deps — it includes channel
plugins, provider SDKs, the full CLI). If that's a dealbreaker:

- `@paperclipai/adapter-openclaw-gateway` publishes a minimal WS client (3
  deps: `ws`, `picocolors`, its own utils) implementing the same handshake. Use
  it as a reference for rolling your own, but note its shape is Paperclip-specific.
- Rolling your own with `ws` + `@noble/ed25519` is doable; the connect frame
  shape is covered in the `GatewayClient.sendConnect()` source.

For our case (the server already has lots of deps), the subpath import wins.

## 6. Security hardening in 2026.4.22

Notable items in the CHANGELOG relevant to anyone integrating:

- `Auth/commands` — require owner identity for owner-enforced commands
- `Agents/gateway tool` — expanded config-mutation guard so models can't
  rewrite operator-trusted paths (sandbox, plugin trust, gateway auth/TLS,
  hook routing/tokens, SSRF policy, MCP servers, per-agent overrides)
- `Security/dotenv` — block `OPENCLAW_*` keys and Matrix/Mattermost/IRC/Synology
  endpoint overrides from workspace `.env` injection
- `Security/external content` — strip Qwen/ChatML/Llama/Gemma/Mistral/Phi/GPT-OSS
  chat-template special tokens (role-boundary spoofing defense)
- `Security/update` — fail closed on plugin / hook-pack integrity drift
- `Plugins/discovery` — reject plugin entries that escape their package dir
- `Control UI/CSP` — tightened `img-src 'self' data:`; remote avatar URLs dropped
- `Sessions/Maintenance` — bounded session store prevents gateway OOM

No public CVE/RCE exists against the package in the CHANGELOG or GitHub
security advisories as of this date. Previous AI-authored claims about a
"CSWSH 1-click RCE fixed in 2026.2.25+" are not corroborated by the actual
changelog — treat them as hallucinated.

`bun audit` will flag transitive advisories in `hono`, `picomatch`,
`path-to-regexp`, but those come from unrelated dependencies (MCP SDK,
shadcn, lint-staged), not from `openclaw` itself.

## 7. What our code does

`server/openclaw.ts` — discovery helper with a 2 s timeout wrapper around both
connect and every RPC. Returns `OpenClawAgent[]` = `{ path, agentId, name?,
isDefault, lastRunAt? }`. Any failure (missing config, gateway down, timeout,
malformed response) → empty array, silently.

Pipeline:

1. Read `~/.openclaw/openclaw.json` for port + token (sync filesystem)
2. Lazy-import `GatewayClient` (keeps startup cost off the critical path if
   the feature's unused)
3. Open one WS connection; wait for `onHelloOk` or 2 s timeout
4. **Round-trip 1** (parallel): `agents.list` + `sessions.list({ includeGlobal })`
5. **Round-trip 2** (parallel per agent): `agents.files.get(IDENTITY.md)`
6. Parse `- **Name:** ...` from the identity markdown; group
   `sessions.list` rows by the `agent:<id>:…` key prefix for `lastRunAt`
7. Map to the `OpenClawAgent` shape; `stop()` the client

That's it — 2 round-trips to get everything we show on `/`.

## 8. Commands worth knowing

```
openclaw status                         # overview (gateway, agents, sessions, security)
openclaw agents list [--json]           # agents + workspaces + bindings (CLI-enriched)
openclaw sessions --all-agents --json   # aggregate sessions across agents (uses RPC)
openclaw logs --follow --json           # tail gateway logs (WS if scoped, else /tmp file)
openclaw devices list                   # pending + paired devices
openclaw devices approve <requestId>    # needs admin scope (chicken-and-egg, see §3)
openclaw doctor                         # lint config, flag risky dm policies
openclaw dashboard                      # open Control UI with token in URL
```

`openclaw --dev` runs a completely isolated instance under `~/.openclaw-dev/`
on port `19001` — useful if you're hacking integrations and don't want to
touch your real gateway. Same for `--profile <name>` (`~/.openclaw-<name>/`).
