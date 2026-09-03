# Hermes Agent — integration research

Protocol notes behind moi's Hermes harness. The adapter **shipped** on the ACP
path recommended below: the protocol lives in `../acp/` (provider-agnostic) and
this folder holds only Hermes specifics — see §11 for what the implementation
confirmed and corrected. Everything here was probed empirically against Hermes
**v0.20.0 (2026.8.3)** on Linux, driving real models (Ollama Cloud
`kimi-k2.7-code`, OpenAI `gpt-5.4-mini`). Reproduce with
`bun scripts/probe-hermes-acp.ts` (see §10).

**Verdict up front:** Hermes speaks **ACP** (Agent Client Protocol) over
stdio JSON-RPC, and ACP maps onto moi's `Harness` contract more cleanly than
either OpenClaw or Codex did. The adapter is a normal harness-sized job — a
12/13-passing end-to-end run of the full moi flow is in §9. Real streaming,
vision, MCP, env injection and multi-agent profiles all work (§3.7–§4).

What actually needs care: Hermes is **user-global by default** where moi is
workspace-scoped (§5), it also ships a much richer **native gateway** whose
features ACP does not expose (§6), and two live-stream bugs need client-side
workarounds — file-tool completions are dropped (§3.4) and `set_model` silently
drops session MCP tools (§3.10).

## 1. What Hermes actually is

The public summaries calling it "a single Rust binary" are **wrong**. It is a
large Python monolith:

- Installed by `curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash`,
  which clones the repo and builds a `uv` venv. Code lands in
  `/usr/local/lib/hermes-agent` (root) or `~/.hermes/hermes-agent` (per-user);
  data always in `$HERMES_HOME` (default `~/.hermes`).
- ~1.5M lines of Python across ~4k files (excluding `venv/`/`node_modules/`).
  For scale: `cli.py` is 18.7k lines, `run_agent.py` 8.3k, and the ACP adapter
  alone is 5.8k. Node 22 comes along for browser tooling.
- The install pulls Python 3.11, Node, ripgrep and ffmpeg automatically. Pass
  `--skip-browser` to skip the ~400 MB Playwright Chromium download.

Scope is much wider than a coding CLI: ~70 tools across ~28 toolsets, a
messaging gateway with 25+ platform adapters (Telegram/Discord/Slack/Signal/…),
cron, a kanban board, voice mode, a skills marketplace, and 7 terminal
backends (local, docker, ssh, modal, daytona, singularity, vercel sandbox).
For moi, nearly all of that is out of scope — moi wants the agent loop and the
ACP surface, not the gateway.

Entry points sharing one `AIAgent` core:

| Surface        | Command               | Shape                                       | Fit for moi                                 |
| -------------- | --------------------- | ------------------------------------------- | ------------------------------------------- |
| CLI            | `hermes`, `hermes -z` | interactive TUI / one-shot                  | one-shot is scriptable, but no event stream |
| **ACP**        | **`hermes acp`**      | **stdio JSON-RPC, one process, N sessions** | **✅ this is the one**                      |
| Backend server | `hermes serve`        | HTTP + WebSocket JSON-RPC, port 9119        | ❌ machine-level singleton (§4)             |
| Gateway        | `hermes gateway run`  | long-running messaging daemon               | ❌ not moi's model                          |

## 2. Provider configuration (and two traps)

Hermes resolves `(provider, model)` → `(api_mode, api_key, base_url)` in
`hermes_cli/runtime_provider.py`, supporting 18+ providers across three API
modes (`chat_completions`, `codex_responses`, `anthropic_messages`). Secrets
live in `$HERMES_HOME/.env`, everything else in `config.yaml`.

Two traps cost real time when wiring up a provider:

1. **Provider ids are not the obvious names.** Ollama Cloud is `ollama-cloud`,
   not `ollama` (`ollama` means a _local_ Ollama). There is no `openai`
   provider id at all — `resolve_runtime_provider(requested='openai')` raises
   `Unknown provider`. OpenAI arrives as `openai-api` in the ACP model list.
2. **`provider: ollama-cloud` resolves to the wrong base URL.** It picks up
   `OLLAMA_API_KEY` correctly but returns
   `base_url = https://openrouter.ai/api/v1` — the overlay's
   `base_url_override` never applies — so every call 401s with
   `Missing Authentication header`. Setting `OLLAMA_BASE_URL` does not help.

   Working configuration, using the custom-endpoint path (whose host-gate in
   `runtime_provider.py` still selects `OLLAMA_API_KEY` for `ollama.com`):

   ```yaml
   model:
     provider: custom
     base_url: https://ollama.com/v1
     default: kimi-k2.7-code
   ```

Credential host-gating is otherwise good and deliberate: keys are matched to
the resolved _host_, not by substring (a hardening for GHSA-76xc-57q6-vm5m),
so an unrelated custom endpoint never receives your OpenAI/OpenRouter key.

## 3. The ACP surface (`hermes acp`)

`acp_adapter/server.py` implements `acp.Agent` against
`agent-client-protocol==0.9.0`. `hermes acp --check` verifies the deps.
stdout is reserved for JSON-RPC; logs go to stderr.

### 3.1 Handshake

`initialize` → protocol v1, and the agent advertises:

```json
{
  "agentCapabilities": {
    "loadSession": true,
    "promptCapabilities": { "image": true },
    "sessionCapabilities": { "fork": {}, "list": {}, "resume": {} }
  },
  "agentInfo": { "name": "hermes-agent", "version": "0.20.0" },
  "authMethods": [
    { "id": "custom", "name": "custom runtime credentials" },
    { "id": "hermes-setup", "type": "terminal", "args": ["--setup"] }
  ]
}
```

`authMethods` is directly usable by moi's `availability()` / `startLogin()`
recovery loop — note `hermes-setup` is `type: terminal`, i.e. it wants a TTY,
not a browser OAuth URL like Codex.

### 3.2 Sessions

`session/new { cwd, mcpServers }` → `{ sessionId, models, modes, _meta }`.
Two things moi's other backends make you fetch separately arrive **inline**:

- `models.availableModels` — 52 entries in the probe, merged across every
  configured provider (`openai-api:gpt-5.4-mini`, `custom:kimi-k2.7-code`, …),
  plus `models.currentModelId`. This is `listModels()` for free. See §3.2.1 for
  the entry shape, which needs normalizing before it reaches a picker.
- `modes.availableModes` — `default` (ask before edits) / `accept_edits` /
  `dont_ask`, plus `currentModeId`. This is the permission policy (§3.5).

#### 3.2.1 The model catalog is three strings, and one of them repeats

Probed against a live install (59 entries): every `availableModels` row has
exactly `modelId`, `name`, `description` — no context window, pricing,
modality or reasoning metadata. Hermes owns all of that (`cache/model_catalog.json`,
`models_dev_cache.json`, `context_length_cache.yaml` under `$HERMES_HOME`) but
does not put any of it on the wire; reading those files means reading Hermes'
private cache format, keyed by ids that do not match ACP's `<provider>:<model>`
namespace. Not worth it.

```json
{
  "modelId": "nous:anthropic/claude-opus-5",
  "name": "Nous Portal · anthropic/claude-opus-5",
  "description": "Provider: Nous Portal"
}
```

Three consequences, all handled in `./models.ts`:

- **`description` is the provider, not a blurb** — the same string for all 34
  models behind it, with a ` • current` suffix on `currentModelId`'s row. moi's
  picker labels rows from the description headline, so passed through as-is it
  renders dozens of identical rows. It becomes the group heading instead.
- **`name` repeats the provider — but not always.** Most rows are
  `"<provider> · <model>"`; the rows from a `providers:` block in `config.yaml`
  carry a bare `"gpt-oss:20b"`. That is why the group is taken from
  `description` and only stripped off `name` when it is actually there.
- **Configured providers are listed twice**, under `<provider>:<model>` and
  again `custom:<provider>:<model>`, same endpoint and model. Both ids work;
  moi keeps the first and drops the duplicate label.

moi also records `providerId` (`nous`, `xai-oauth`, `ollama-launch`) alongside
the display heading, because the heading is Hermes-authored prose and the id is
not — anything that needs to pin, order or persist a provider should key on the
id. It is recovered by peeling the model label off the end of `modelId`, not by
splitting on the first colon: model ids carry their own colons (`gpt-oss:20b`)
and `custom:` occupies the first slot as a namespace (`custom:ollama-launch:…`
→ `ollama-launch`) except when it is itself the provider (`custom:kimi-k2.7-code`
→ `custom`, the base_url escape hatch from §2).

`_meta.hermes.sessionProvenance` carries `rootHermesSessionId`,
`parentHermesSessionId`, `sessionKind` and `compressionDepth` — session
lineage across compaction, which moi has no concept of today.

`session/list` returns `{ sessionId, title, cwd, updatedAt }[]` — including a
**model-generated title** (e.g. "Create hello.txt and read back text").
`cwd` on every record means moi filters by workspace path exactly the way the
Codex harness filters `thread/list`. This covers `listSessions()` and
`workspacePreview()`.

Session state is one **global** SQLite DB at `$HERMES_HOME/state.db` (20
tables, FTS5 trigram index over messages). The `sessions` table is richer than
what moi's current backends expose — it already carries `cwd`, `git_branch`,
`git_repo_root`, `parent_session_id`, per-session token counts and
`estimated_cost_usd`/`actual_cost_usd`.

#### 3.2.2 The default model rides on `currentModelId`, and the catalog is cached

`session/new` also returns `currentModelId` — the model Hermes resolves from
the profile's `config.yaml` (`model.default` + `model.provider`, rewritten by
`hermes model`). `./models.ts` maps it onto a synthetic `default` row with
`resolvedModel`, the same convention the Claude and Codex harnesses use, so
the picker preselects the model a promptless chat would actually run.
Verified against v0.20.0 (`xai-oauth:grok-build-0.1`, 67 raw rows).

The catalog only ever arrives on `session/new`, and every such call persists a
zero-message row in `state.db` that `hermes sessions list` shows as a blank
entry (moi's own list hides them). So the state is cached per workspace
(`../acp/model-state.ts`): the first picker snapshot opens one throwaway
session, every real chat start refreshes the cache from its own `session/new`,
and the cache is stamped with the mtimes of the profile's `config.yaml` and
`.env` (`hermesConfigFingerprint`) so a default changed outside moi is
rediscovered on the next snapshot instead of on every one.

### 3.3 The prompt stream

`session/prompt` streams `session/update` notifications and resolves with
`{ stopReason, usage }`. Observed update kinds:

| `sessionUpdate`             | Carries                                               | moi display mapping               |
| --------------------------- | ----------------------------------------------------- | --------------------------------- |
| `agent_message_chunk`       | token deltas                                          | `preview` frames + assistant text |
| `agent_thought_chunk`       | token deltas                                          | thinking parts                    |
| `tool_call`                 | `toolCallId`, `title`, `kind`, `locations`, `content` | `ToolCall` start                  |
| `tool_call_update`          | `status: completed\|failed`, `content`                | `ToolCall` result                 |
| `session_info_update`       | generated `title`, `updatedAt`                        | `sessions_changed`                |
| `available_commands_update` | slash commands                                        | init metadata                     |
| `usage_update`              | context `size` / `used`                               | context meter                     |
| `user_message_chunk`        | replayed user turns                                   | history only (§3.6)               |

`kind` is semantic (`execute`, `edit`, `read`) with `locations: [{path}]`, so
moi gets Codex-style semantic tool labels rather than Claude Code's raw
`tool_use` pairs. Terminal calls arrive pre-titled (`terminal: echo step1`).

Final result:

```json
{
  "stopReason": "end_turn",
  "usage": {
    "inputTokens": 34750,
    "outputTokens": 157,
    "cachedReadTokens": 0,
    "thoughtTokens": 0,
    "totalTokens": 34907
  }
}
```

Token streaming is **always on** — there is no opt-in flag, so moi gates
forwarding on its side exactly like it does for Codex.

### 3.4 ⚠️ Live file-tool completions are dropped

**Reproducible bug.** In the live stream, `terminal` tool calls always get
their `tool_call_update` (3 starts → 3 completions), but `read_file` /
`write_file` calls **never do** (4 starts → 0 completions, twice in a row).
In moi's UI those tool cards would hang in `pending` forever.

Cause is the pairing strategy: live completions are matched by **tool name**
through a FIFO queue (`acp_adapter/events.py`, `make_tool_progress_cb` /
`make_step_cb`), driven by a `step_callback(api_call_count, prev_tools)` that
reports the _previous_ step's tools. The file-tool path doesn't round-trip
through that queue.

The same session replayed through `session/load` is **complete and correct** —
4 `tool_call` + 4 `tool_call_update` with results — because the replay path
(`server.py`) pairs by real `tool_call_id` from message history instead.

Consequences for a moi adapter:

- Tool-call ids are **not stable** between live and replay: live emits
  `tc-<hash>`, replay emits `functions.<tool>:<index>`. Never key persisted
  state on them across a reload.
- Workaround without patching Hermes: on `stopReason`, mark any still-pending
  tool call as completed (moi already owns turn accounting), or re-read
  history. Upstream fix would be to pair by `tool_call_id` live too.

### 3.5 Permissions — a real approval flow

Unlike every harness moi ships today, Hermes has a **working interactive
approval flow**: `session/request_permission` arrives as an agent→client
request with a proper diff payload and options
(`allow_once` / `reject_once`), and a denial genuinely blocks the write.

A/B probe, denying every prompt:

| mode       | prompts fired | `gated.txt` written |
| ---------- | ------------- | ------------------- |
| `dont_ask` | 0             | ✅ yes              |
| `default`  | 1             | ❌ no               |

So `session/set_mode { modeId: 'dont_ask' }` reproduces moi's
bypass-permissions trust model in one call — that is the shipping path. But
Hermes is also the first backend that would let moi build real approval UI
(README's "permission requests as events" wish-list item) without fighting the
provider.

### 3.6 Resume, fork, cancel, model switch

- `session/load { sessionId, cwd }` replays full history as `session/update`
  notifications (`user_message_chunk` + thoughts + paired tool calls +
  message chunks). This is `sessionEvents()`, and it's higher-fidelity than
  the live stream.
- `session/cancel` → the in-flight `session/prompt` resolves with
  `stopReason: "cancelled"` immediately (8.0s prompt cancelled at t+8.0s).
  Cleanly distinguishable from `end_turn`, which is what moi's contract needs
  to tell aborts from failures.
- `session/set_model { modelId }` succeeds mid-session — **live model switch**,
  no teardown-and-resume dance (Claude Code's weak spot). ⚠️ but see §3.10.
- `fork` and `resume` are advertised in `sessionCapabilities`.

### 3.7 Streaming is real token streaming

Measured cadence on a 12.5s turn (`probe … timing`):

| stream                | frames | first frame | median gap | avg gap |
| --------------------- | ------ | ----------- | ---------- | ------- |
| `agent_thought_chunk` | 378    | 7704ms      | 1ms        | 7.7ms   |
| `agent_message_chunk` | 299    | 10613ms     | 1ms        | 6.2ms   |

Both thinking **and** answer text stream token-by-token — this is not batched
delivery. The two are sequential, not interleaved: thinking runs to completion
(7.7s→10.6s), then the answer streams (10.6s→12.5s). That is the model's
shape, not a protocol limit, so an adapter should not assume ordering.

The number to watch is **7.7s to first frame**. That is process spawn +
`session/new` + prompt assembly, and Hermes assembles a very large prompt
(~38k input tokens for a trivial task, ~24k on a warmed session). A moi
harness must hold the process open per workspace — spawn-per-turn would put
that latency in front of every message.

### 3.8 Vision works

`{ type: 'image', mimeType: 'image/png', data: <base64> }` in the `prompt`
array is accepted (`promptCapabilities.image: true`). Against
`openai-api:gpt-5.4-mini` the agent described a generated test image
correctly — "a large red circle … a dark blue rectangle … plain white
background, circle on the left". So moi's `imagesInline: 'base64'` capability
applies; no path-note fallback needed. Vision needs a vision-capable model —
`kimi-k2.7-code` is not one, so this is a per-model capability the picker
should reflect. Hermes also has an `auxiliary.vision` model slot that can
route image understanding to a _different_ model than the chat model.

### 3.9 Env injection works

Env set on the `hermes acp` process reaches the agent's shell tools: a
`MOI_TEST_ENV` set at spawn came back from `printenv` inside the agent's
terminal tool. This is exactly moi's model — per-workspace env frozen at
spawn, `onEnvChanged()` reaping idle processes to pick up changes.

### 3.10 MCP: works per-session, but `set_model` silently drops it ⚠️

`session/new { mcpServers: [{ name, command, args, env }] }` really does
register servers **per session**. A throwaway stdio MCP server exposing one
tool was picked up as `mcp__mini__moi_secret_number` (Claude Code's
namespacing convention), the tool surface refreshed to 28 tools, and the agent
called it and returned the secret value. Per-session scoping is exactly what
moi needs to give each workspace its own connectors.

**But `session/set_model` destroys them.** Isolated A/B on the same MCP server:

|                    | model switch                | MCP tool result    |
| ------------------ | --------------------------- | ------------------ |
| `research` profile | none                        | ✅ returned `4173` |
| `default` profile  | → `openai-api:gpt-5.4-mini` | ❌ `NO_TOOL`       |

Cause: `set_session_model` rebuilds the agent with
`session_manager._make_agent(...)` but never re-runs
`_register_session_mcp_servers` — registration only happens on `new_session`,
`load_session`, `resume_session` and `fork_session`
(`acp_adapter/server.py`). The rebuilt agent comes back with no MCP tools and
the model just reports it lacks them.

This matters because moi offers a per-chat model picker. Workarounds: re-issue
`session/load` after every `set_model` (it re-registers), or treat model
switches as teardown-and-resume when connectors are attached. The one-line
upstream fix is to call `_register_session_mcp_servers` from
`set_session_model` too.

There is also a global MCP layer (`hermes mcp add/list/test`, plus a
Nous-curated `hermes mcp catalog` for one-click installs). Those servers are
user-global, so per-workspace connectors should go through the ACP
`mcpServers` argument, not the global config.

### 3.11 Channel sessions (Telegram, Discord, …) are invisible to ACP

`session/list` is hard-filtered to `source="acp"`:
`db.list_sessions_rich(source="acp", …)` in `acp_adapter/session.py`. The
`sessions` table tags every row with `source` (observed: `acp`, `cli`; the
gateway writes `telegram`, `discord`, …) plus `chat_id` / `chat_type` /
`user_id`. So a Telegram conversation **never** appears in moi's session list,
and moi can never accidentally hijack one.

That is the right default, and it also means moi cannot show them without
going around ACP: read `state.db` directly, or drive the gateway protocol
(§5). Worth knowing that gateway sessions are keyed by
`(platform, chat_id, user_id)` and run inside the long-lived gateway daemon
with no meaningful `cwd` — they are not workspace-scoped at all, so they do
not fit moi's workspace model even if surfaced.

`session/list` does support server-side filtering and pagination:
`{ cwd, cursor }`. Verified cold (fresh process, no in-memory sessions):
19 sessions unfiltered → 8 for one workspace → 0 for a bogus path. Cold rows
recover their cwd from the `model_config` JSON blob, not the (often empty)
`cwd` column — so don't read that column directly.

## 4. Multiple agents = profiles

Hermes profiles are close to OpenClaw agents, and moi can use them the same
way — except moi can also **create** them, which it cannot do for OpenClaw.

```
$ hermes profile list
 Profile     Model            Gateway   Alias      Distribution
 ◆default    kimi-k2.7-code   stopped   —          —
  research   kimi-k2.7-code   stopped   research   —
```

`hermes profile create research --clone --description "…"` makes
`~/.hermes/profiles/research/` with its **own** `config.yaml` (own model),
`.env` (own keys), `SOUL.md` (own persona), `skills/` (77 cloned), `memories/`,
`sessions/`, `cron/`, `hooks/`, `workspace/`. It also writes a wrapper script
`~/.local/bin/research` → `hermes -p research`.

ACP is profile-aware: **`hermes -p research acp`** works, and isolation is
real — the `research` profile's `session/list` returned `[]` while `default`
had 19. The `--description` field exists specifically so an orchestrator can
route work by role.

So a moi harness has three viable shapes, and this is a product decision:

1. **Import profiles as agents** (OpenClaw's model) — `hermes profile list`
   is the discovery call, `agentId` on `SendMessageInput` already exists for
   exactly this, and `hermes -p <id> acp` is the spawn. Many workspaces can
   share one profile.
2. **One profile per workspace**, created on demand — gives per-workspace
   model, persona, skills and memory, and is the closest fit to
   `.moi/.workspace.json`.
3. **`HERMES_HOME` per workspace** — heavier (§5) and mostly redundant now
   that profiles exist. Prefer profiles.

## 5. The architectural mismatch: global vs workspace-scoped

This is the real integration cost, not the protocol.

**moi is workspace-scoped.** Every workspace has its own settings in
`.moi/.workspace.json`, its own env, its own agent config, and a workspace is
shareable via git.

**Hermes is a user-global singleton by default.** One `$HERMES_HOME`, one
`config.yaml` with one `model.default`, one `SOUL.md` (the agent's
identity/system prompt), one `state.db` holding every session from every cwd,
one memory store, one skills library. `hermes serve` is explicitly
machine-level ("attach to (or start) ONE machine-level server").

ACP escapes this because `session/new` takes a `cwd` and `session/list`
filters on it; profiles (§4) escape it for model/persona/skills/memory. What
stays global regardless: the `state.db` file, the installed code, and the
global MCP + skills registries. Two mitigations:

1. **Shared home, filter by cwd** (what the Codex harness already does with
   `thread/list`). Simplest; workspaces share model/SOUL/memory/skills unless
   they also get separate profiles.
2. **`HERMES_HOME` per workspace**, injected at process spawn. Total
   isolation, but ~54 MB + caches per home (the `models_dev_cache.json` alone
   is 3.6 MB) and mostly superseded by profiles.

Concurrency is fine either way: two `hermes acp` processes in different cwds
sharing one `$HERMES_HOME` ran simultaneously with correct isolation and **no
SQLite contention** (Hermes detects the SQLite 3.45.1 WAL-reset bug and falls
back to `journal_mode=DELETE`).

Process topology matches moi's held-open model: **one process per workspace,
N sessions inside it** — the same shape as `codex/client.ts`, so per-workspace
env injection at spawn works unchanged.

## 6. Their own gateway — and what it has that ACP doesn't

Hermes has a second, native surface that is much larger than ACP. Two layers
share the name "gateway":

- **`hermes gateway run`** — the messaging daemon. 25+ platform adapters
  (Telegram, Discord, Slack, Signal, WhatsApp, Teams, Google Chat, email,
  WeChat…), user authorization by allowlist and DM pairing, slash-command
  dispatch, cron scheduling, delivery ledger, drain/restart control.
- **`hermes serve`** — the backend the desktop app talks to: a FastAPI app on
  port 9119 with **135 HTTP routes** plus `/api/ws`, `/api/events`,
  `/api/pub`, `/api/console`, `/api/pty`. The chat plane inside it is
  `tui_gateway`, a JSON-RPC method server with ~85 methods.

`tui_gateway` methods that ACP has **no equivalent for** — this is the real
answer to "what do we lose by choosing ACP":

| Area            | Gateway methods                                                   | ACP                            |
| --------------- | ----------------------------------------------------------------- | ------------------------------ |
| Steering        | `session.steer`, `subagent.steer`, `subagent.interrupt`           | ❌ (only `session/cancel`)     |
| Compaction      | `session.compress`, `session.context_breakdown`                   | ❌ (opaque)                    |
| History editing | `session.undo`, `session.branch`, `session.seed`                  | ⚠️ `fork` only                 |
| Subagents       | `delegation.status`, `delegation.pause`                           | ❌ not modelled                |
| Attachments     | `image.attach_bytes`, `pdf.attach`, `file.attach`, `image.detach` | ⚠️ images inline only          |
| Tool policy     | `tools.list/show/configure`, `toolsets.list`                      | ❌                             |
| Skills          | `skills.manage`, `skills.reload`, `learning.*`, `insights.get`    | ❌                             |
| Agents          | `agents.list` (profiles)                                          | ❌ (spawn-level only)          |
| Scheduling      | `cron.manage`                                                     | ❌                             |
| Terminal        | `terminal.read/resize`, `process.list/kill`, `shell.exec`         | ❌                             |
| Approvals       | `approval.respond`, `clarify.respond`, `sudo.respond`             | ⚠️ `request_permission` only   |
| Autocomplete    | `complete.path`, `complete.slash`, `commands.catalog`             | ⚠️ `available_commands_update` |
| Billing         | `billing.*`, `subscription.*` (Nous portal)                       | ❌                             |

Plus REST: `/api/env` (GET/PUT/DELETE/reveal), `/api/memory/*`,
`/api/messaging/*` (per-platform config and Telegram/WhatsApp pairing
onboarding), `/api/model/*` including `auxiliary` and `moa`, `/api/curator`,
`/api/analytics/usage`, `/api/gateway/start|stop|drain|restart`.

Event vocabulary is richer too: `agent.token`, `agent.thinking`,
`agent.reasoning_effort`, `agent.service_tier`, `message.delta/interim/react`,
`session.*` lifecycle.

**Recommendation: still ACP.** The gateway is an internal, undocumented,
fast-moving protocol for Nous's own desktop app, and half its surface
(billing, pets, messaging onboarding, cron) is irrelevant to moi. ACP gives
moi ~90% of the chat plane against a stable public contract. The three
gateway-only things moi would genuinely miss are **mid-turn steering**,
**subagent lanes**, and **compaction visibility** — all of which moi renders
today for Codex/Claude Code, so expect a slightly flatter experience on
Hermes. If those become blocking, the escape hatch is to run `hermes serve`
alongside ACP and use it as a _control plane only_, keeping chat on ACP.

## 7. What Hermes has that moi has no concept of

Worth knowing before deciding how deep to integrate — these are the reasons
someone picks Hermes, and moi currently models none of them:

- **Self-improving skills.** Hermes writes its own skills from experience and
  maintains them with a background "curator". moi's skills are authored
  artifacts synced into the workspace; there is no notion of the agent
  editing its own skill library. 14 bundled skill packs ship with the repo.
- **Persistent cross-session memory** with pluggable providers
  (`plugins/memory/`), retrieved during prompt assembly.
- **`SOUL.md`** — a user-level agent identity/persona file, orthogonal to
  moi's per-workspace `AGENTS.md`.
- **Context compression as a first-class lifecycle** with session lineage
  (`parentHermesSessionId`, `compressionDepth`) surviving compaction.
- **Auxiliary model slots** — separate models for vision, compression and web
  extraction, independent of the chat model. moi has one model per chat.
- **Non-local terminal backends** (docker/ssh/modal/daytona/…). moi assumes
  the agent runs where the workspace is.

None of these block an adapter; all of them are invisible through ACP unless
moi chooses to surface them.

## 8. Adapter shape and effort

Against the checklist in `../README.md`:

| Feature               | Hermes via ACP                                                        |
| --------------------- | --------------------------------------------------------------------- |
| Long-lived session    | ✅ one process, N sessions                                            |
| Resume                | ✅ `session/load` (+ `fork`, `resume`)                                |
| Interrupt             | ✅ `session/cancel` → `stopReason: cancelled`                         |
| List models           | ✅ inline on `session/new`, all providers merged                      |
| Live model switch     | ⚠️ `session/set_model` works but drops MCP tools (§3.10)              |
| Live effort switch    | ❌ no reasoning-effort concept in ACP (gateway has it)                |
| Token deltas          | ✅ real streaming, thinking + text (§3.7)                             |
| Images in input       | ✅ base64 blocks, verified end to end (§3.8)                          |
| Interactive approvals | ✅ real, with diffs — best of any backend                             |
| Session list/history  | ✅ `session/list` (cwd filter + cursor) + `session/load`              |
| Home card preview     | ✅ `session/list` has `title` + `updatedAt` + `cwd`                   |
| MCP                   | ✅ per-session via `session/new` (§3.10); no status RPC               |
| Env injection         | ✅ spawn env reaches agent shell (§3.9)                               |
| Multiple agents       | ✅ profiles, importable _and_ creatable (§4)                          |
| Usage reporting       | ✅ per-turn tokens + `usage_update` context meter; cost in `state.db` |
| Queue/steer mid-turn  | ❌ ACP has no steer (gateway does)                                    |
| Subagent lanes        | ❌ `delegate_task` renders as a plain tool call                       |
| Native user echo      | ❌ no optimistic-id echo — server synthesizes, like Claude Code       |
| Tool results (live)   | ⚠️ file tools drop completions (§3.4)                                 |
| Channel sessions      | ❌ invisible to ACP by design (§3.11)                                 |

Folder would follow the existing convention:

```
server/harness/hermes/
  adapter.ts     session/update → StreamEvent
  session.ts     per-session state machine
  client.ts      spawn `hermes acp`, stdio JSON-RPC framing
  sessions.ts    session/list + session/load replay
  index.ts       the Harness object
  NOTES.md       this file
```

Touch points outside the folder are small and already enumerated by the Codex
precedent: `lib/types.ts` (`WorkspaceType` union), `lib/workspace-types.ts`
(ordering), `lib/format.ts` (`provider` union), `server/harness/registry.ts`,
`server/harness/executable.ts` (PATH lookup), `server/api.ts`
(`CREATABLE_TYPES`), and a handful of client files that branch on provider
(`client/features/chat/tool-group/format.ts`,
`client/features/home/workspace-setup/WorkspaceAgentStep.tsx`,
`client/features/dev/HarnessDebugPage.tsx`).

**Effort: comparable to Codex, likely a little less.** ACP is a documented
standard rather than a reverse-engineered protocol, the semantic tool vocabulary
already matches what the adapter layer converges on, and models/modes arrive
inline. Hacks actually required:

1. `session/set_mode('dont_ask')` on every new session (one call, §3.5).
2. Close orphaned file-tool cards at `stopReason` (§3.4) — or upstream a fix.
3. Re-register MCP servers after every `session/set_model`, or teardown-resume
   instead (§3.10) — this one bites the per-chat model picker.
4. Provider config workaround for the `ollama-cloud` base-URL bug (§2), or
   pin users to providers that resolve correctly.
5. Decide the profile policy (§4) — the only genuinely architectural call.

**Strategic note:** an ACP adapter is not Hermes-specific. ACP is the protocol
Zed's agent panel speaks, and other agents (Gemini CLI, opencode) implement it
too. Building `harness/acp/` with a thin Hermes profile on top would likely
cost the same as building `harness/hermes/` and would generalize.

## 9. End-to-end verification

`probe … e2e` drives the whole moi-shaped flow on one connection — spawn with
workspace env → `session/new` scoped to cwd → `set_mode('dont_ask')` →
tool-using turn → vision turn → interrupt → **kill the process** → cold
`session/list` by cwd → `session/load` replay → continue the conversation.

Run against the `research` profile, `openai-api:gpt-5.4-mini`, with an MCP
server attached — **12/13 passed**:

```
✓ initialize              hermes-agent 0.20.0
✓ session/new + set_mode  cwd=wsE2E
✓ model catalog inline    52 models
✓ turn 1 (tools + env)    env reached agent shell; prompts=0
✓ token streaming         170 thought + 23 message frames
✓ per-turn usage          37888 in / 358 out
✗ mcp tool                NO_TOOL          ← §3.10, caused by set_model
✓ vision                  "a bright red filled circle on a plain white…"
✓ interrupt               stopReason=cancelled
✓ session/list by cwd     title="Write e2e.txt from MOI_TEST_ENV"
✓ history replay          2 tool_call / 2 tool_call_update, 4 user turns
✓ replay tool pairing     complete
✓ context survives resume "I wrote `moi-env-works-7391` into `e2e.txt`."
```

The single failure is the `set_model` → MCP regression, isolated in §3.10:
the same MCP server works when no model switch happens.

## 10. Reproducing

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-browser
# configure a provider (see §2 for the ollama-cloud trap)
hermes acp --check

export HERMES_BIN=/usr/local/lib/hermes-agent/venv/bin/hermes
export PROBE_CWD=/path/to/workspace

bun scripts/probe-hermes-acp.ts caps      # initialize / list / models / modes
bun scripts/probe-hermes-acp.ts stream    # live session/update frames
bun scripts/probe-hermes-acp.ts timing    # token-streaming cadence
bun scripts/probe-hermes-acp.ts replay <sessionId>
bun scripts/probe-hermes-acp.ts cancel    # stopReason semantics
bun scripts/probe-hermes-acp.ts modes     # dont_ask vs default A/B
bun scripts/probe-hermes-acp.ts vision    # inline image block
bun scripts/probe-hermes-acp.ts env       # spawn env → agent shell
bun scripts/probe-hermes-acp.ts mcp ./mini-mcp.py
PROBE_PROFILE=research PROBE_MODEL=openai-api:gpt-5.4-mini \
  bun scripts/probe-hermes-acp.ts e2e
```

`mcp`/`e2e` need a stdio MCP server exposing a `moi_secret_number` tool
returning `4173`; any 40-line script works (`PROBE_MCP_CMD` sets the
interpreter).

## 11. Implementation notes (shipped)

What driving the protocol through moi confirmed, beyond the probes:

- **The `acp/` split is the deliverable.** `acp/{wire,client,adapter,session,discovery}.ts`
  is provider-agnostic; `hermes/` supplies an `AcpProviderConfig` (spawn spec,
  no-prompt mode id, image support) plus profile discovery. A second ACP agent
  should be a folder next to `hermes/`, not a fork of the protocol.
- **Chunks are not messages.** ACP streams text and thinking token-by-token
  with no message boundary, so `acp/adapter.ts` owns the accumulation rule:
  consecutive chunks build one assistant turn, and a tool call both closes the
  open run and becomes its own turn. This is what makes the transcript read in
  execution order instead of collapsing into one blob.
- **A completing `tool_call_update` carries no `title`** — only the opening
  `tool_call` does. Naively re-deriving the name from each frame degrades the
  card from `terminal: echo hi` to the bare kind `execute` the moment the call
  finishes. The established name has to outrank the update's `kind`.
- **The §3.4 file-tool gap is real in practice**, and the fix is cheap: any
  tool call still unsettled when `session/prompt` resolves is closed as
  successful. The turn ending is proof the call finished.
- **`session/prompt`'s promise IS the turn.** It resolves at end of turn with
  `{ stopReason, usage }`, so activity is mirrored from it rather than derived
  by counting frames, and `cancelled` arrives on the same promise — the
  interrupt path needs no separate signal.
- **No steer.** A send that lands mid-turn is queued in `acp/session.ts` and
  flushed when the running turn resolves; an interrupt drops the queue.
- **Model catalog caching.** `listModels()` has no session to read from, so the
  catalog is cached per workspace off a throwaway `session/new`. Zero-history
  sessions are invisible to `session/list`, so this leaves no debris.
- **MCP is not wired yet.** moi passes `mcpServers: []`, which sidesteps the
  §3.10 `set_model` regression. Per-workspace connectors are the next step and
  will need the re-register workaround.

Verified live against the running server: session rename, 130+ preview frames
per turn, tool cards settling to success (including the file write Hermes never
completes), `stopped` on interrupt with the partial answer preserved, cold
`session/load` replay after a server restart, per-chat model switching, and
image attachments through moi's upload pipeline.

## 12. The official SDK, and the version skew it exposed

The wire types are no longer hand-written. `../acp/wire.ts` re-exports
[`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk),
whose types are generated from the protocol's JSON Schema (262 definitions).

**Which package.** The one most search results point at,
`@zed-industries/agent-client-protocol`, is formally deprecated —
`"This package has been renamed to @agentclientprotocol/sdk"` — and froze at
0.4.5 in Oct 2025. The live package is `@agentclientprotocol/sdk`
(Apache-2.0, 1.3.0, ~5.2M weekly downloads vs ~20k for the deprecated one).
The protocol now lives in a vendor-neutral org; JetBrains maintains a repo too.

**Types only, dev-only.** `dist/schema/types.gen.js` has no runtime code, so
`import type` costs nothing and ships nothing. Importing _values_ instead
(`AGENT_METHODS`, `ClientSideConnection`, `ndJsonStream`) would pull zod in as
a real dependency for the sake of a few string constants, so moi keeps its own
method strings — verified against the SDK's `AGENT_METHODS` at 1.3.0 — and its
own transport, which already carries the `/dev/harness` wire tap, per-workspace
process lifecycle and env injection at spawn.

**⚠️ Hermes trails the spec.** This is the substantive finding. Hermes pins
Python `agent-client-protocol==0.9.0` (PyPI is at 0.12.0), a revision where
_models_ are first-class. The current spec has **no model concept at all**:

|                                               | `session/set_model` |
| --------------------------------------------- | ------------------- |
| `@zed-industries/agent-client-protocol@0.4.5` | 8 occurrences       |
| `@agentclientprotocol/sdk@1.0.0` … `1.3.0`    | **0**               |

`session/set_model` and `models.availableModels` were replaced by
`session/set_config_option` + `SessionConfigOption` (a select/boolean option
list on `NewSessionResponse`). moi's per-chat model picker rides on the old
shape, so `wire.ts` keeps a small, clearly-labelled "pre-1.0 additions" block
(`AcpModelInfo`, `AcpModelState`, `AcpNewSessionResult`). **Delete it when
Hermes moves to config options** — that is the whole migration.

Everything else moi consumes is current: `session_info_update` and
`usage_update` are both in the spec (`usage_update` requires `size`, which was
optional in the hand-written version).

**What the official types caught.** The spec models `tool_call` as `ToolCall`
(`title: string`, required) and `tool_call_update` as `ToolCallUpdate`
(`title?: string | null`) — independent confirmation of the §11 title-carryover
bug, now enforced by the compiler rather than by a comment. They also tightened
three things the hand-written types were sloppy about: `StopReason` is a closed
union (`end_turn | max_tokens | max_turn_requests | refusal | cancelled`),
`ToolKind` has ten members (not seven), and optional fields are `T | null`
rather than merely absent.

**Not adopted yet:** `ContentChunk.messageId`. The spec gives chunks an
explicit message boundary — "a change in `messageId` indicates a new message"
— which is the principled version of `AssistantTurnAccumulator`'s heuristic.
Hermes 0.20.0 does not send it, so the accumulator stays; prefer `messageId`
when an agent provides it.

## 13. Skills are profile-global, not workspace-local

Hermes resolves skills from exactly two places — `$HERMES_HOME/skills`
(`hermes_constants.get_skills_dir`) and the explicit `skills.external_dirs`
list in `config.yaml`. **There is no cwd-relative skill path.** Under
`hermes -p <name>`, `$HERMES_HOME` is `<root>/profiles/<name>`, so the scanned
directory is `<profile>/skills`.

moi therefore installs its skills into the **profile home**, not the
workspace, even though the workspace is `<profile>/workspace`. Installing into
the workspace (the OpenClaw shape, where the workspace _is_ the agent root)
leaves them invisible: `skills list` omits them and `skill view moi-workspace`
fails outright. The agent can still stumble on the files by shell-searching the
cwd, which is what made the bug look like it worked.

`skillsDir` climbs back with `profileHomeFromWorkspace()` — the exact inverse
of `profileWorkspace()`, kept beside it in `discovery.ts`, returning null for
any path moi did not lay out so callers fall back instead of writing into an
unrelated parent. `skillsDirFor` is the single resolver, so install, update and
version-check all follow.

Verified against Hermes 0.20.0:

- a flat `<skills>/<name>/SKILL.md` is discovered — the bundled tree is
  `<skills>/<category>/<name>/`, but the scanner accepts both
- `skills list` reports it as `local` / `enabled`, and `skill view` returns
  its body
- `hermes update` will not delete it: `tools/skills_sync.sync_skills` iterates
  the _bundled_ list only and never scans the destination for unknown entries;
  its one `rmtree` is gated on the directory hashing identical to a bundled
  skill

**Consequences, accepted deliberately.** The skills are profile-global: every
session on that profile sees them, including plain `hermes` runs and gateway
(Telegram/Discord) chats — not just moi. Importing the _default_ profile puts
them in `~/.hermes/skills`, the root install's own directory. They also outlive
the workspace: removing the moi workspace leaves the skill in the profile's
list. Nothing writes to `config.yaml`, `.env` or `SOUL.md` — this is the same
directory `hermes skills install` targets.

Workspaces imported before this landed keep a stale copy under
`<workspace>/skills/`. It is inert (Hermes never scans there) and is left
alone rather than deleted.

## 14. Archiving a chat is moi-side

ACP specifies `session/delete`, but Hermes does not implement it — probed
directly, it answers JSON-RPC **-32601 "Method not found"**. `session/close`
returns `{}` but only drops the live session; the chat still lists. There is no
`session/archive` at all.

Hermes _does_ have the right primitive internally —
`hermes_state.SessionDB.set_session_archived(session_id, archived)`, a soft hide
that keeps every message and walks the whole compression chain (archiving only
the visible tip lets the still-unarchived root resurrect it). Its `sessions`
table has an `archived` column, and `list_sessions_rich` takes
`include_archived: bool = False`, which the ACP adapter never overrides — so an
archived session would drop out of `session/list` for free.

The problem is reach: the only callers of `set_session_archived` are HTTP routes
on `hermes serve` and the gateway API server, daemons moi deliberately does not
run (§6). The `hermes sessions archive` CLI is filter-based (age, source, title,
cwd — no session id), and `hermes sessions delete <id>` is a real delete.

So moi hides the chat on its own side, which is what the **Claude Code harness
already does** — it tags a session `moi:archived` and filters the list rather
than deleting anything. `../acp/archived.ts` keeps a per-workspace id list in
moi's data dir; `listAcpSessions` and the home-card preview filter against it,
and `forgetAcpSession` drops the live record. Because it lives in the ACP layer,
any future ACP provider inherits archiving without implementing anything.

Consequence, and the correct boundary: the chat stays in Hermes's own store and
is still visible to `hermes sessions list` and the gateway. moi hides a chat
from moi, not from the user's agent. Nothing is destroyed, and the store is a
plain id list, so unarchiving is a one-liner (`unarchiveAcpSession`) if a route
ever wants it.
