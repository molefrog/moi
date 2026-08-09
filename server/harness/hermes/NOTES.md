# Hermes Agent — integration research

Research notes on driving [Hermes Agent](https://github.com/NousResearch/hermes-agent)
(Nous Research, MIT) as a moi harness. **Nothing is implemented** — this folder
holds notes only. Everything below was probed empirically against Hermes
**v0.20.0 (2026.8.3)** on Linux, driving real models (Ollama Cloud
`kimi-k2.7-code`, OpenAI `gpt-5.4-mini`). Reproduce with
`bun scripts/probe-hermes-acp.ts` (see §7).

**Verdict up front:** Hermes speaks **ACP** (Agent Client Protocol) over
stdio JSON-RPC, and ACP maps onto moi's `Harness` contract more cleanly than
either OpenClaw or Codex did. The adapter is a normal harness-sized job. The
real work is not the protocol — it's that Hermes is a **user-global singleton**
where moi is workspace-scoped (§4), and that one live-stream bug needs a
client-side workaround (§3.4).

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

| Surface | Command | Shape | Fit for moi |
| --- | --- | --- | --- |
| CLI | `hermes`, `hermes -z` | interactive TUI / one-shot | one-shot is scriptable, but no event stream |
| **ACP** | **`hermes acp`** | **stdio JSON-RPC, one process, N sessions** | **✅ this is the one** |
| Backend server | `hermes serve` | HTTP + WebSocket JSON-RPC, port 9119 | ❌ machine-level singleton (§4) |
| Gateway | `hermes gateway run` | long-running messaging daemon | ❌ not moi's model |

## 2. Provider configuration (and two traps)

Hermes resolves `(provider, model)` → `(api_mode, api_key, base_url)` in
`hermes_cli/runtime_provider.py`, supporting 18+ providers across three API
modes (`chat_completions`, `codex_responses`, `anthropic_messages`). Secrets
live in `$HERMES_HOME/.env`, everything else in `config.yaml`.

Two traps cost real time when wiring up a provider:

1. **Provider ids are not the obvious names.** Ollama Cloud is `ollama-cloud`,
   not `ollama` (`ollama` means a *local* Ollama). There is no `openai`
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
the resolved *host*, not by substring (a hardening for GHSA-76xc-57q6-vm5m),
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
  plus `models.currentModelId`. This is `listModels()` for free.
- `modes.availableModes` — `default` (ask before edits) / `accept_edits` /
  `dont_ask`, plus `currentModeId`. This is the permission policy (§3.5).

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

### 3.3 The prompt stream

`session/prompt` streams `session/update` notifications and resolves with
`{ stopReason, usage }`. Observed update kinds:

| `sessionUpdate` | Carries | moi display mapping |
| --- | --- | --- |
| `agent_message_chunk` | token deltas | `preview` frames + assistant text |
| `agent_thought_chunk` | token deltas | thinking parts |
| `tool_call` | `toolCallId`, `title`, `kind`, `locations`, `content` | `ToolCall` start |
| `tool_call_update` | `status: completed\|failed`, `content` | `ToolCall` result |
| `session_info_update` | generated `title`, `updatedAt` | `sessions_changed` |
| `available_commands_update` | slash commands | init metadata |
| `usage_update` | context `size` / `used` | context meter |
| `user_message_chunk` | replayed user turns | history only (§3.6) |

`kind` is semantic (`execute`, `edit`, `read`) with `locations: [{path}]`, so
moi gets Codex-style semantic tool labels rather than Claude Code's raw
`tool_use` pairs. Terminal calls arrive pre-titled (`terminal: echo step1`).

Final result:

```json
{ "stopReason": "end_turn",
  "usage": { "inputTokens": 34750, "outputTokens": 157,
             "cachedReadTokens": 0, "thoughtTokens": 0, "totalTokens": 34907 } }
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
reports the *previous* step's tools. The file-tool path doesn't round-trip
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

| mode | prompts fired | `gated.txt` written |
| --- | --- | --- |
| `dont_ask` | 0 | ✅ yes |
| `default` | 1 | ❌ no |

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
  no teardown-and-resume dance (Claude Code's weak spot).
- `fork` and `resume` are advertised in `sessionCapabilities`.

## 4. The architectural mismatch: global vs workspace-scoped

This is the real integration cost, not the protocol.

**moi is workspace-scoped.** Every workspace has its own settings in
`.moi/.workspace.json`, its own env, its own agent config, and a workspace is
shareable via git.

**Hermes is a user-global singleton.** One `$HERMES_HOME`, one `config.yaml`
with one `model.default`, one `SOUL.md` (the agent's identity/system prompt),
one `state.db` holding every session from every cwd, one memory store, one
skills library. `hermes serve` is explicitly machine-level ("attach to (or
start) ONE machine-level server"). Multi-tenancy exists as **profiles**
(`hermes profile create/use`), but profiles are *user identities*, not
workspaces.

ACP is the one surface that escapes this, because `session/new` takes a `cwd`
and `session/list` reports it. Two mitigations, both viable:

1. **Shared home, filter by cwd** (what the Codex harness already does with
   `thread/list`). Simplest; workspaces share model/SOUL/memory/skills.
2. **`HERMES_HOME` per workspace**, injected at process spawn. Gives true
   per-workspace config, memory and skills at the cost of duplicated setup and
   a much larger disk footprint (~54 MB + caches per home; the shared
   `models_dev_cache.json` alone is 3.6 MB).

Concurrency is fine either way: two `hermes acp` processes in different cwds
sharing one `$HERMES_HOME` ran simultaneously with correct isolation and **no
SQLite contention** (Hermes detects the SQLite 3.45.1 WAL-reset bug and falls
back to `journal_mode=DELETE`).

Process topology matches moi's held-open model: **one process per workspace,
N sessions inside it** — the same shape as `codex/client.ts`, so per-workspace
env injection at spawn works unchanged.

## 5. What Hermes has that moi has no concept of

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

## 6. Adapter shape and effort

Against the checklist in `../README.md`:

| Feature | Hermes via ACP |
| --- | --- |
| Long-lived session | ✅ one process, N sessions |
| Resume | ✅ `session/load` (+ `fork`, `resume`) |
| Interrupt | ✅ `session/cancel` → `stopReason: cancelled` |
| List models | ✅ inline on `session/new`, all providers merged |
| Live model switch | ✅ `session/set_model` |
| Live effort switch | ❌ no reasoning-effort concept in ACP |
| Token deltas | ✅ always on (moi gates forwarding) |
| Images in input | ✅ `promptCapabilities.image` |
| Interactive approvals | ✅ real, with diffs — best of any backend |
| Session list/history | ✅ `session/list` + `session/load` |
| Home card preview | ✅ `session/list` has `title` + `updatedAt` + `cwd` |
| MCP status | ⚠️ `mcpServers` passed at `session/new`; no status RPC probed |
| Usage reporting | ✅ per-turn tokens + `usage_update` context meter; cost in `state.db` |
| Queue/steer mid-turn | ❓ not probed |
| Native user echo | ❌ no optimistic-id echo — server synthesizes, like Claude Code |
| Tool results (live) | ⚠️ file tools drop completions (§3.4) |

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
3. Provider config workaround for the `ollama-cloud` base-URL bug (§2), or
   pin users to providers that resolve correctly.
4. Decide the `HERMES_HOME` policy (§4) — the only genuinely architectural call.

**Strategic note:** an ACP adapter is not Hermes-specific. ACP is the protocol
Zed's agent panel speaks, and other agents (Gemini CLI, opencode) implement it
too. Building `harness/acp/` with a thin Hermes profile on top would likely
cost the same as building `harness/hermes/` and would generalize.

## 7. Reproducing

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-browser
# configure a provider (see §2 for the ollama-cloud trap)
hermes acp --check

bun scripts/probe-hermes-acp.ts stream   # prompt + live session/update frames
bun scripts/probe-hermes-acp.ts caps     # initialize/list/models/modes
bun scripts/probe-hermes-acp.ts replay <sessionId>   # history fidelity
bun scripts/probe-hermes-acp.ts cancel   # stopReason semantics
bun scripts/probe-hermes-acp.ts modes    # dont_ask vs default A/B
```
