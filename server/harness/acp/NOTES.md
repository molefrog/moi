# ACP agents — conformance, findings, and the plan

Three ACP-speaking agents driven through the **same** checklist by
`scripts/probe-acp.ts`, the provider-agnostic probe. Hermes background is in `../hermes/NOTES.md`;
fx specifics are in §9 of this file. Every cell
below is a verdict the probe printed, not a reading of docs. Run date
2026-09-04, macOS arm64.

| Agent  | Command            | Version                                                     | Model used                          | Result                                                                        |
| ------ | ------------------ | ----------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Hermes | `hermes acp`       | 0.20.0 (2026.8.3) **and 0.21.0 (2026.8.31)**, local install | `xai-oauth:grok-build-0.1`          | 39 pass · 3 partial · 2 fail · 1 skip (0.21.0: 38 · 4 · 2 · 1, same verdicts) |
| fx     | `fx acp`           | 0.0.7 dev `7e02f32f7fca`                                    | `zai/glm-5.3-flash` (gateway)       | 36 pass · 2 partial · 6 fail                                                  |
| Cursor | `cursor-agent acp` | 2026.09.02-c22c1a3                                          | `auto-smart[optimize_for=balanced]` | 35 pass · 2 partial · 7 fail                                                  |

Reproduce (each run opens a few real sessions and costs a handful of short
model turns):

```bash
ACP_CMD="hermes acp"       PROBE_CWD=/tmp/ws-h bun scripts/probe-acp.ts matrix
ACP_CMD="fx acp"           PROBE_CWD=/tmp/ws-f PROBE_MODEL=openai/gpt-5.4-nano bun scripts/probe-acp.ts matrix
ACP_CMD="cursor-agent acp" PROBE_CWD=/tmp/ws-c PROBE_MODEL='composer-2.5[fast=true]' bun scripts/probe-acp.ts matrix
# all with PROBE_MCP_SERVER=$PWD/scripts/mini-mcp-server.ts PROBE_OUT=<file>.json
```

The Grok CLI (`~/.grok/bin/agent`) was checked and set aside: it emits ACP
session updates as an output format but has no ACP server mode.

**Bottom line.** All three work end to end over ACP: tools, env injection,
streaming, cancel, images, per-session MCP, cold `session/list` by cwd, and a
conversation that survives a process restart. Each has one structural gap a
generic host must design around:

- **Hermes**: file-tool calls never get their live completion (known, §3.4 of
  its notes); the approval gate covers file tools only, the model routes
  around a denial with a shell redirect; no `messageId` on chunks.
- **fx**: **one active session per process** — opening or resuming a second
  session invalidates the first (`Session is not active`), so moi must run a
  process per chat, not per workspace; `session/load` flattens tool history
  into prose; startup diagnostics leak into the assistant stream.
- **Cursor**: no `agentInfo`, no usage of any kind; resumes chats through
  `session/load` with full replay (the documented path — only the newer
  attach-without-replay `session/resume` RPC and `session/close` are absent);
  asks permission for shell and MCP calls even in `agent` mode (silenced by
  the global `--force` flag); plan mode sends a custom `cursor/create_plan`
  request the client must answer.

## 1. Feature matrix (what a moi harness needs)

Legend: ✅ works · ⚠️ partial or needs a workaround · ❌ missing. "Custom ACP"
is what a generic adapter may assume of an unknown agent: only what all three
share, everything else feature-detected.

| Feature                              | Hermes 0.20.0                                                    | fx 0.0.7                                                                                                                            | Cursor 2026.09.02                                                                                                                                                                      | Custom ACP (assume)                                      |
| ------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Process topology                     | ✅ 1 process / N sessions                                        | ❌ 1 **active** session / process; `resume`/`load` switch it                                                                        | ✅ 1 process / N sessions                                                                                                                                                              | detect (probe row)                                       |
| Start cost                           | ⚠️ init 0.4 s, `session/new` 2.5 s, first token ~13 s            | ✅ init 0.6 s, `session/new` 3 ms, first token 2 s                                                                                  | ⚠️ init 0.4 s, `session/new` 3.1 s, first token ~13 s                                                                                                                                  | hold processes open                                      |
| `agentInfo`                          | ✅ hermes-agent/0.20.0                                           | ✅ fx/0.0.7                                                                                                                         | ❌ absent                                                                                                                                                                              | optional                                                 |
| Auth discovery                       | ✅ `authMethods` (oauth + terminal setup)                        | ❌ none → `fx status --json`                                                                                                        | ✅ `cursor_login` (+ `agent status`)                                                                                                                                                   | optional, out-of-band hook                               |
| Model catalog                        | ✅ pre-1.0 `models` on `session/new` (70, provider-merged)       | ✅ `configOptions[model]` (241)                                                                                                     | ✅ both `models` and `configOptions` (37, parameterized ids)                                                                                                                           | either shape or none                                     |
| Live model switch                    | ✅ `session/set_model` (drops session MCP, NOTES §3.10)          | ✅ `session/set_config_option`                                                                                                      | ✅ `session/set_config_option` (`set_model` also answers `{}`)                                                                                                                         | whichever is advertised                                  |
| Effort / reasoning control           | ❌ none over ACP (gateway only)                                  | ❌ `effort` exists in settings, not over ACP; `set_config_option effort` silently ignored; a bogus model id is accepted unvalidated | ⚠️ baked into the model id (`…[effort=high]`); only the exact catalog strings are accepted — a custom bracket or bare id is "Invalid model value", `effort` is "Unknown config option" | none                                                     |
| Permission modes                     | ✅ default / accept_edits / dont_ask                             | ✅ ask / code (+ `FX_PERMISSION_MODE=yolo` env)                                                                                     | ✅ agent / plan / ask (+ global `--force`)                                                                                                                                             | modes optional                                           |
| Reported mode after new/load         | ✅ honest                                                        | ❌ says `ask`, behaves as configured `auto` until set                                                                               | ✅ honest                                                                                                                                                                              | always re-set the mode                                   |
| Interactive approvals                | ⚠️ real for file tools; shell not gated, model bypassed a denial | ✅ real; denial respected                                                                                                           | ⚠️ asks for shell + MCP in `agent`, never for writes; plan/ask are read-only, not approvals                                                                                            | answer `request_permission`                              |
| Token streaming                      | ✅ text + heavy thoughts (96 frames)                             | ✅ text; thoughts sparse on this model                                                                                              | ✅ text + thoughts                                                                                                                                                                     | yes                                                      |
| `messageId` on chunks                | ❌                                                               | ✅                                                                                                                                  | ❌                                                                                                                                                                                     | optional                                                 |
| Clean assistant stream               | ✅                                                               | ❌ diagnostics arrive as the first message chunks                                                                                   | ✅                                                                                                                                                                                     | filter hook                                              |
| Tool-call labels                     | ✅ descriptive `title` + `locations` + `diff` content            | ⚠️ generic `title` ("Running"); identity in non-spec `name` + `rawInput`                                                            | ⚠️ shell titled by command, files "Edit File"/"Read File"; `rawInput` empty at start, filled on update; `diff` content, `rawOutput`, `locations` on updates                            | kind + title + rawInput                                  |
| Live tool pairing                    | ⚠️ file tools never complete (3 starts / 1 update)               | ✅ incremental `in_progress` chunks then JSON envelope                                                                              | ✅ 3 starts / 8 updates                                                                                                                                                                | close open calls at turn end                             |
| Tool-call ids                        | ✅ `tc-<hash>` live, `functions.<tool>:<n>` on replay            | ✅ `chatcmpl-tool-<hex>`                                                                                                            | ⚠️ contain a newline (`call-…-0\nfc_…`)                                                                                                                                                | opaque string                                            |
| Usage on `session/prompt`            | ✅ in/out/cached/thought/total                                   | ⚠️ in/out only                                                                                                                      | ❌ none                                                                                                                                                                                | optional                                                 |
| `usage_update` (context meter)       | ✅ used/size                                                     | ✅ used/size + non-spec `cost`                                                                                                      | ❌                                                                                                                                                                                     | optional                                                 |
| Session titles                       | ✅ generated                                                     | ⚠️ 40-char prompt prefix                                                                                                            | ✅ generated, async (sometimes "Okay")                                                                                                                                                 | optional                                                 |
| `session/list` by cwd                | ✅                                                               | ✅                                                                                                                                  | ✅                                                                                                                                                                                     | optional (`sessionCapabilities.list`)                    |
| History replay (`session/load`)      | ✅ user + thoughts + paired tools (1.5 s)                        | ❌ tools flattened into prose, no thoughts (3 ms)                                                                                   | ✅ user + thoughts + paired tools (3.7 s)                                                                                                                                              | lossy or absent                                          |
| `session/resume` (attach, no replay) | ✅ (also replays)                                                | ✅ no replay, switches the active session                                                                                           | ❌ Method not found — resume goes through `session/load` (full replay), as Cursor's docs prescribe                                                                                     | optional                                                 |
| `session/fork` / `close` / `delete`  | ✅ / ✅ / ❌                                                     | ❌ / ✅ / ❌                                                                                                                        | ❌ / ❌ / ❌                                                                                                                                                                           | none                                                     |
| Cancel                               | ✅ `cancelled` in 84 ms                                          | ✅ 28 ms                                                                                                                            | ✅ 3 ms                                                                                                                                                                                | yes                                                      |
| Images in prompt                     | ✅                                                               | ✅                                                                                                                                  | ✅                                                                                                                                                                                     | check `promptCapabilities.image`                         |
| Embedded `resource` block            | ✅ inline                                                        | ⚠️ local `file://` only; read via tool this run                                                                                     | ✅ inline (despite advertising `embeddedContext: false`)                                                                                                                               | check capability, fall back to a path note               |
| Session-scoped MCP                   | ✅ (`tool_search` → `mcp__mini__…`)                              | ✅ (`capability_search` → `mcp_select_tool` → `mcp_mini_…`); global `mcp.json` ignored                                              | ✅ (asks permission per call)                                                                                                                                                          | pass `mcpServers`, expect failures to fail `session/new` |
| Env injection                        | ✅                                                               | ✅                                                                                                                                  | ✅                                                                                                                                                                                     | yes                                                      |
| Mid-turn steer                       | ❌ (ACP) — but advertises `/steer` and `/queue` slash commands   | ❌                                                                                                                                  | ❌                                                                                                                                                                                     | no                                                       |
| Subagent lanes                       | ❌ flat tool call                                                | ❌ flat tool call                                                                                                                   | not probed                                                                                                                                                                             | no                                                       |
| Non-spec extras seen                 | `_meta.hermes.sessionProvenance`                                 | `name`, `command_result`, `cost`, `permissionMode`                                                                                  | `cursor/create_plan` request, `rawOutput`                                                                                                                                              | ignore unknown fields                                    |
| On-disk store                        | global `state.db` (SQLite)                                       | `~/.fx/sessions/<id>/` event log with full turns + diffs                                                                            | `~/.cursor/acp-sessions/<id>/` `meta.json` + `store.db` (encrypted blobs)                                                                                                              | none                                                     |

## 2. Per-agent notes

### Hermes — re-verified locally, on 0.20.0 and again after updating to 0.21.0

The Linux research in `../hermes/NOTES.md` holds on this macOS install
(`~/.hermes`, provider `xai-oauth`, default `grok-build-0.1`). `hermes update`
took the install from 0.20.0 (2026.8.3) to **0.21.0 (2026.8.31, upstream
`d3630f85`, 10,297 commits)** and the matrix was rerun: **not one verdict
changed**. The only differences are a bigger catalog (70 → 92 rows, same
`Provider: …` description format, so `hermes/models.ts` still parses it),
a slower `session/new` (2.5 s → 6.6 s) and first token (13 s → 24 s) on the
same model, and the embedded-resource test answering via a tool read
instead of inline — model behaviour, not protocol. Reading the 0.21.0
adapter source confirms the rest: still pinned to `agent-client-protocol==0.9.0`
(pre-1.0 `models` / `set_model` dialect, `configOptions` empty),
`set_session_model` still rebuilds the agent without re-attaching session
MCP servers (§3.10 of the Hermes notes), live tool completion is still paired
by tool name through a FIFO queue (§3.4), and no `messageId` anywhere. New:
`session/set_config_option` accepts `edit_approval_policy` (`ask` / …) mapped
onto the three modes — a second way to set the mode, still undeclared on
`session/new`.

Observations from both runs:

- `initialize` now returns the provider's oauth entry in `authMethods` next
  to the terminal setup entry, so `availability()` could read it.
- Both the file-tool completion gap (§3.4) and the honest-but-noisy stream
  (96 thought frames before 28 text frames, first token at 13 s) reproduce.
- **New:** in `default` mode the approval prompt arrived with a proper diff
  and the probe denied it, but the model then ran
  `echo 'no-prompt-needed' > gated-default.txt` through the terminal tool,
  which is not gated in that mode. A denial is advice to the model, not a
  sandbox. Only `dont_ask` is honest about that.
- **New:** `session/resume` replays history exactly like `session/load`
  (4 user chunks, 3 tool pairs), so the two are interchangeable for Hermes.
- **New:** `available_commands_update` lists `/steer` ("Inject guidance into
  the currently running agent turn") and `/queue`. ACP has no steer RPC, but
  a client could send `/steer …` as a prompt; untested.
- `session_info_update` carries `_meta.hermes.sessionProvenance` on every
  frame — lineage across compaction, still unused by moi.
- Global `session/list` shows the profile's own sessions (`cwd:
~/.hermes/workspace`) alongside workspace ones; the cwd filter is what keeps
  moi's list clean.

### fx — see §9; two corrections from this run

- **One active session per process.** `session/new` #2 makes #1 answer
  `-32602 Session is not active`; `session/resume` or `session/load` switch
  the active session back and forth. This overturns the "one process per
  workspace is a convenience" line in the earlier fx probe: moi must spawn **one
  `fx acp` per chat** (cheap, 3 ms per `session/new`) or serialize every
  chat of a workspace through resume-switching, which cannot host two
  concurrent turns. Per-chat processes it is.
- The embedded resource test went through a tool call this time (the earlier
  run answered inline); treat inline resources as best-effort on fx.

Everything else matches the notes: diagnostics in the stream, lossy
`session/load`, `session/resume` attaches silently, generic tool titles,
cost in `usage_update`, denial respected in `ask` mode.

### Cursor — first look

`cursor-agent acp` (the Cursor CLI's ACP server; the same binary is
`agent` on PATH via `~/.local/bin/cursor-agent`). Auth is the Cursor login
(`agent status` → "Logged in as …"); `authMethods` advertises `cursor_login`.

Shape of the surface:

- `initialize`: `loadSession: true`, `mcpCapabilities.http/sse`,
  `promptCapabilities.image: true`, `embeddedContext: false` (but inline
  resources worked), `sessionCapabilities.list` only, **no `agentInfo`**.
- `session/new` (3 s): `modes` agent / plan / ask, **both** a pre-1.0
  `models` block and `configOptions` (`mode`, `model`). Model ids are
  parameterized: `claude-opus-5[thinking=true,context=300k,effort=high,fast=false]`,
  `auto-smart[optimize_for=balanced]`, `composer-2.5[fast=true]`. That is
  Cursor's own effort/context/fast surface folded into the id — a picker can
  expose it by parsing the bracket list. `available_commands_update` lists
  ~20 slash commands and skills.
- Tool calls: shell calls are titled by their command (`` `printenv …` ``),
  file calls generically (`Edit File`, `Read File`) with `rawInput: {}` on
  the opening frame; the `tool_call_update`s then carry `rawInput`,
  `rawOutput`, `locations` and `diff` content. `toolCallId` values contain a
  literal newline.
- Approvals: in `agent` mode a shell command and an MCP call each raised
  `session/request_permission`; file writes did not. `plan` and `ask` are
  read-only modes, not approval flows — in `plan` the agent sent a custom
  `cursor/create_plan` request (an ACP extension request) instead of
  writing. The global `--force` flag (`cursor-agent --force acp`) removes
  the prompts entirely: 0 prompts on the same turn.
- Nothing about usage: no `usage` on the prompt result, no `usage_update`.
- Titles are generated asynchronously; one run got "Shell Command E2E", a
  `caps` run got "Okay".
- Resuming a chat is `session/load`, and its replay is complete (user
  chunks, thoughts, paired tool calls). That is the path Cursor's ACP docs
  name ("Resume an existing conversation: `session/load`"); the newer
  `session/resume` RPC, plus `close`, `fork` and `delete`, are "Method not
  found". Replay was broken until CLI build 2026.06.04 (Cursor forum thread
  158388: `session/load` sent no `session/update`s in 2026.04 and 2026.05
  builds, fixed in 2026.06.04) — a host should keep a floor on the CLI
  version.
- On disk: `~/.cursor/acp-sessions/<id>/meta.json` (`cwd`, `title`) and a
  `store.db` SQLite of encrypted blobs, plus `acp-config.json` holding the
  selected model. `session/list` and `session/load` read that store cold.
  It is **separate from the interactive CLI's chats**: `cursor-agent -p
--resume <acp session id>` answered "I don't have that earlier turn in this
  thread", so ACP sessions are not visible to `agent ls` / `agent resume`
  and vice versa.
- Process is shared across sessions (multi-session check passes).

## 3. Effort (reasoning level)

None of the three exposes effort over ACP, although the spec has a slot for
it: a `configOptions` entry with `category: "thought_level"`. What each agent
does natively, and how moi could reach it outside ACP:

| Agent  | Native surface                                                                                                                                                                                               | Over ACP                                                                                                                                                                                               | Backup path for moi                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hermes | `hermes chat --reasoning none\|minimal\|low\|medium\|high\|xhigh\|max\|ultra`; config `agent.reasoning_effort` + per-model `agent.reasoning_overrides`; `/reasoning` slash command in the TUI                | nothing; `hermes acp` has no `--reasoning`; `/reasoning` is not in the ACP command list; `set_config_option` stores any id but nothing reads it                                                        | **write `agent.reasoning_effort` (or a `reasoning_overrides` entry) into the profile's `config.yaml`** — `_make_agent` calls `load_config()` on every `session/new`, `load`, `resume` and `set_model`, so the next attach picks it up without a process restart. Workspace-scoped because moi binds a profile per workspace; moi already fingerprints that file.                                                                                                    |
| fx     | `~/.fx/settings.json` `effort` (`auto` default), copied into each session's `preferences.effort`; `/model <id> <effort> [normal\|fast]` in the TUI; no `--effort` flag, no `FX_EFFORT` env (only `FX_MODEL`) | nothing; `configOptions` are `provider`, `model`, `mode`; `set_config_option effort` is silently accepted and ignored                                                                                  | **write `effort` into `~/.fx/settings.json` before `session/new`** — verified: `effort: "high"` in settings → session `preferences.effort: "high"` and the gateway request carries `effort=high reasoning=selected` (trace). Global file, so write → spawn → `session/new` → restore, which the per-chat process topology makes atomic enough. Do **not** send `/model …` as prompt text: the model treated it as an instruction and edited `settings.json` itself. |
| Cursor | bracket parameters on the model id (`claude-opus-5[thinking=true,context=300k,effort=high,fast=false]`); `--model 'x[effort=low]'` for the interactive CLI; `~/.cursor/cli-config.json` `modelParameters`    | one fixed variant per model in the catalog; `set_config_option model` accepts only those exact strings (`Invalid model value` for any other bracket or a bare id); `effort` is `Unknown config option` | **none found.** Editing `modelParameters` / `selectedModel` in `cli-config.json`, editing `acp-config.json`, and `cursor-agent --model '…[effort=low]' acp` all leave the catalog variant unchanged — the variants are server-defined. Upstream ask only.                                                                                                                                                                                                           |

Recommendation: keep `liveEffortSwitch: false` for the `acp` type. If effort
is wanted before upstream adds `thought_level` options, Hermes and fx can be
driven through their config files at attach time (a `setEffort?(ctx, level)`
hook on the agent definition); Cursor cannot.

## 4. Subagents

All three delegate through a single tool call; none nests child activity in
ACP frames. Where the child's transcript can be recovered:

| Agent  | Tool on the wire                                                                                                                                                                                                   | Child activity over ACP                         | Child transcript on disk                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hermes | `delegate_task` (`title: "delegate: <goal>"`, kind `execute`), returns `{status: "dispatched", mode: "background", delegation_id}`; the parent then polls a `subagents` tool and reads the child's log with `read` | none                                            | **live, append-only log**: `~/.hermes/cache/delegation/live/<delegation_id>/task-N.log`, one line per event (`user`, `start`, `tool -> terminal(echo …)`, `result terminal ok 0.1s: {...}`, `think`, `assistant`, `final status=completed duration=6.13s`) plus `manifest.json` (goal, status, log path). The `delegation_id` is in the tool result on the wire, so moi could tail the log into a subagent lane while it runs. Children are not sessions in `state.db`. |
| fx     | `subagent` (`title: "Managing"`, kind `other`, `rawInput.request.{action: "run", task}`), returns `{ok, result}` prose                                                                                             | none                                            | **a full hidden session**: `~/.fx/sessions/<parent>/subagent/children.json` lists child ids; each child is its own `~/.fx/sessions/<childId>/` with `events.jsonl` (`history_turn_committed` → `tool_steps` with `shell`, `write_file`, `read_file`), absent from `index.json` and returning 0 turns from `fx session --id`. Recoverable after the fact, not live.                                                                                                      |
| Cursor | `task` (`title: "Task: <name>"`, kind `other`, `rawInput._toolName: "task"` + `prompt`), returns the child's report                                                                                                | none (one `tool_call` for the whole delegation) | nothing readable: the ACP store is encrypted blobs. Subagents are defined as `.cursor/agents/<name>.md` (project) or `~/.cursor/agents/` (user) with `name` + `description` frontmatter and a system prompt body; a project one was picked up without restart.                                                                                                                                                                                                          |

For moi: a flat tool card is the honest render today. A Hermes subagent lane
is feasible by tailing the live log keyed on `delegation_id`; an fx lane is
feasible from disk once the child finishes. Neither is in the nine changes.

## 5. Sessions: list, archive, and where the agent can run

| Question                     | Hermes                                                                                                                                                                                                                                | fx                                                                                                                                                                                                                                                                                                                     | Cursor                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| List over ACP                | ✅ `session/list { cwd }`, no cursor seen; rows `{ sessionId, cwd, title, updatedAt }`, titles generated                                                                                                                              | ✅ `session/list { cwd }`; titles are the prompt prefix                                                                                                                                                                                                                                                                | ✅ `session/list { cwd }`; titles generated async                                                                                                            |
| List without spawning        | `state.db` (SQLite, global; ACP rows recover cwd from a JSON blob, the `cwd` column is empty)                                                                                                                                         | `~/.fx/sessions/index.json` (`workspace_root`, `title`, `preview`, `updated_at_ms`) or `fx sessions --json [--all] --limit --cursor` with pagination                                                                                                                                                                   | `~/.cursor/acp-sessions/<id>/meta.json` (`cwd`, `title`)                                                                                                     |
| History without ACP          | `state.db` only                                                                                                                                                                                                                       | `fx session --id <id> --json` returns `history[]` with `tool_steps` (same shape as the event log) — a supported CLI path                                                                                                                                                                                               | none (encrypted)                                                                                                                                             |
| Archive / delete over ACP    | ❌ `session/delete` Method not found                                                                                                                                                                                                  | ❌                                                                                                                                                                                                                                                                                                                     | ❌                                                                                                                                                           |
| Archive / delete via CLI     | `hermes sessions delete <id>` (hard delete); `hermes sessions archive` is filter-based and **did not match ACP sessions** by `--cwd` (empty column) or `--title` (`--source acp` too)                                                 | none (`fx session` inspects, resumes, migrates, recovers; no delete)                                                                                                                                                                                                                                                   | none (`agent ls` / `resume` are interactive; no delete)                                                                                                      |
| moi's answer                 | keep the moi-side archive store (`archived.ts`) for all three                                                                                                                                                                         | same                                                                                                                                                                                                                                                                                                                   | same                                                                                                                                                         |
| Any folder or preconfigured? | **any cwd**: `session/new { cwd }` works in a scratch dir. Identity, skills and memory are per profile, so moi's profile-per-workspace binding is a moi choice, not a Hermes requirement (OpenClaw-style agent binding is not needed) | **any cwd under `$HOME`**: works anywhere, but project rules (`AGENTS.md`) are applied only when the workspace is below the home directory — outside it the trace logs `project_rules_omitted reason=workspace is not below home` (verified both ways). `fx workspace add PATH` adds extra roots per primary workspace | **any cwd**: worked in scratch dirs with no trust prompt over ACP; the interactive CLI has `--trust`. Subagents and rules come from `.cursor/` in the folder |

So none of the three needs a preconfigured workspace the way OpenClaw does.
fx's home-directory rule is the one constraint worth surfacing in moi's
workspace setup (a workspace under `/tmp` silently loses its `AGENTS.md`).

## 6. What moi needs

Only the changes moi's harness contract and UI consume today; everything else the probes found is in §7 and stays out.

### What breaks today

`acp/` is already the provider-agnostic layer and `hermes/` a thin config on
top. Nine assumptions in it fail on the next two agents or on a custom one:

| Assumption in `acp/` today                                  | Breaks on                             |
| ----------------------------------------------------------- | ------------------------------------- |
| one process per workspace serves every session              | fx (one active session per process)   |
| catalog is `models` on `session/new`, switch is `set_model` | fx (config options only), Cursor      |
| the opening `tool_call.title` is the card label             | fx ("Running"), Cursor ("Edit File")  |
| newest `content` replaces the card output                   | fx (incremental `in_progress` chunks) |
| every `agent_message_chunk` is assistant text               | fx (diagnostics)                      |
| cold load = `session/load` replay                           | fx (prose), custom agent (maybe none) |
| auth state comes from `authMethods` or a known CLI          | fx (empty), custom agent              |
| `WorkspaceType` is the provider (`'hermes'`)                | custom agents (no code per agent)     |
| provider is a compile-time `Record` key in the client       | custom agents                         |

### The nine changes

#### 1. Topology per agent (`client.ts`)

Key the process pool by `workspacePath` for `per-workspace` agents (Hermes,
Cursor) and by `workspacePath + sessionId` for `per-session` agents (fx).
Nothing else in the transport changes: env injection, stderr draining, the
unbounded `session/prompt` timeout, `__exit` fan-out. Per-session processes
are reaped on archive and on the existing idle TTL.

#### 2. Two model dialects (`discovery.ts`, `model-state.ts`, `session.ts`)

Read the catalog from `configOptions[id=model]` when present, else from
`models` (Cursor sends both and they agree). Switch with
`session/set_config_option { configId: 'model' }` when the catalog came from
config options, else `session/set_model`. Refresh the cache from the switch
response, which fx and Cursor return in full. Remember a `-32601` per
process so the layer stops retrying an unsupported method. Effort stays
`liveEffortSwitch: false`; if it is ever wanted, it is an optional
`setEffort?(ctx, level)` hook on the definition that edits the agent's own
config file before attach (Hermes profile `config.yaml`, fx `settings.json`),
see §3 — Cursor has no path.

#### 3. Re-apply the mode after new, load and resume (`session.ts`)

Every agent comes back in its default mode after `session/load`, and fx
reports `ask` while behaving as `auto` until told otherwise. The recipe is
per agent and includes what is not a mode:

| Agent  | mode id                                                                    | plus                                       |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------ |
| Hermes | `dont_ask`                                                                 | —                                          |
| fx     | `code`                                                                     | env `FX_PERMISSION_MODE=yolo`              |
| Cursor | `agent`                                                                    | `--force` before `acp` on the command line |
| custom | first of `dont_ask` / `code` / `agent` / `yolo` the agent lists, else none |

`applyNoPromptMode` already runs on new and resume; it needs the env/args
half and to run after load too.

#### 4. One cold-load path per agent (`session.ts` + new `journal.ts`)

`session/load` replay is complete on Hermes and Cursor and stays their path.
fx replays tool history as prose, and a custom agent may not replay at all,
so moi keeps its own transcript: append every emitted `StreamEvent` of a
moi-driven session to `DATA_DIR/acp-journal/<workspace-hash>/<sessionId>.jsonl`.
Cold load = journal if present, else `session/load` replay. The journal
carries real timestamps, which retires `run-durations.ts`. Re-attaching a
process to a session stays `session/load` (replay consumed silently when
the journal was used), because that is the one method all three implement.

#### 5. Tool cards keyed on identity, appending output (`adapter.ts`)

Label from a per-agent vocabulary keyed on the non-spec `name` (fx) or on
`kind` + `rawInput` / `locations` (all), falling back to `title`. Append
`in_progress` content instead of replacing it; treat the `completed`
payload as metadata when the card already has streamed output; fold fx's
`command_result` and Cursor's `rawOutput` into output and exit code. Keep
the existing rules: the opening title outranks a bare `kind`, and calls
still open when the prompt resolves are closed as success. Port tgfx's
`tools.ts` table for fx.

#### 6. Drop fx's diagnostic chunks (`adapter.ts`)

The first `agent_message_chunk` message of a turn whose text starts with
`[context]` or `skill discovery warning:` becomes a `SystemNotice`, never
assistant text. They share one `messageId`, so the check is per message,
not per chunk. Harmless on agents that never send them.

#### 7. Availability out of band (per agent)

fx advertises no `authMethods`; the composer banner needs an answer anyway.
Per agent: fx runs `fx status --json` (`auth`, `auth_refreshable`), Cursor
runs `agent status`, Hermes keeps its profile check. Login spawns `fx login`
/ `agent login` and the existing server watch loop re-probes. A custom agent
reports available when its binary resolves.

#### 8. One `acp` workspace type plus an agent definition

Instead of one `WorkspaceType` per agent:

```
lib/types.ts        WorkspaceType = 'claude-code' | 'openclaw' | 'codex' | 'acp'
                    WorkspaceEntry.acp?: { agent: string }   // 'hermes' | 'fx' | 'cursor' | 'custom:<uuid>'
.moi/.workspace.json   { "harness": { "type": "acp", "agent": "fx" } }
DATA_DIR/acp-agents.json   custom entries: { label, command, args, env }
```

The definition is data plus the hooks above:

```ts
type AcpAgentDefinition = {
  id: string
  label: string
  icon: string
  command: { bin: string; args: string[]; env?: Record<string, string> }
  topology: 'per-workspace' | 'per-session' // §1
  catalog?: 'config-options' | 'models' | 'auto' // §2 (auto = detect)
  noPrompt?: { modeId?: string; env?: Record<string, string>; args?: string[] } // §3
  tools?: ToolVocabulary
  dropDiagnostics?: boolean // §5, §6
  availability?(ctx): Promise<HarnessAvailability>
  startLogin?(ctx) // §7
  discoverWorkspaces?(): Promise<DiscoveredWorkspaceCandidate[]> // hermes profiles
  models?: { map?(state): Model[]; fingerprint?(ctx): Promise<string> } // hermes
}
```

Presets live in `acp/agents/{hermes,fx,cursor,generic}.ts`; the registry
merges them with the custom file. The `Harness` object is built once from a
definition. `'hermes'` remains a valid registry value for one release and is
read as `{ type: 'acp', agent: 'hermes' }`.

#### 9. Client fallbacks

- `WorkspaceType` gains `'acp'`; icon and label maps resolve
  `acpAgentPresentation(agentId)` with a generic plug icon and the
  definition's label as the default.
- One `format/acp.ts` tool-group formatter keyed on `kind`, with the agent's
  vocabulary supplied in `meta.provider` (`acp:fx`, `acp:cursor`), replaces
  `format/hermes.ts`.
- Workspace setup lists presets from `GET /api/harnesses/acp/agents` plus a
  "Custom…" entry (command, args, env).

### Order

1. §1 topology key and §2 dialect shim — Hermes keeps working, fx becomes
   possible.
2. §3, §5, §6 in `session.ts` / `adapter.ts` with a per-agent config object
   (today's `AcpProviderConfig` grown into the definition above).
3. §4 journal.
4. §8 and §9 — the type, the registry, the client lookup, the setup entry.
5. fx and Cursor presets; §7 availability hooks.

Each step ships alone. Nothing needs a big-bang change.

## 7. Probed, and deliberately left out of the plan

Findings that moi does not consume today, kept so nobody re-probes them. The
probe's raw per-check rows are regenerated by running it (`PROBE_OUT=` writes
JSON):

- `session/fork`, `session/close`, `session/delete`, and the `session/resume`
  versus `session/load` distinction beyond the cold-load path. Archiving is
  moi-side; idle kill replaces close.
- `messageId` on chunks — moi accumulates chunks itself.
- Usage on the prompt result, `usage_update`, fx `cost`, Cursor's missing
  usage — no context meter or cost widget is wired.
- Embedded `resource` blocks — the path-note fallback works on all three.
- Session-scoped MCP semantics — moi passes no servers yet.
- Approval modes, the deny A/B, the Hermes denial bypass, an `ask` policy —
  moi bypasses approvals on every backend.
- Cursor's `cursor/create_plan` request — `client.ts` already answers unknown
  requests with an error, so nothing hangs.
- Effort control — no agent exposes it over ACP (fx ignores an `effort`
  config id, Cursor only accepts verbatim catalog ids); the effort picker
  stays hidden for ACP workspaces.
- Agent-generated titles, Cursor's newline in tool ids, fx's `provider`
  option, Hermes `/steer` and `/queue`, subagent lanes, the safety reviewer,
  `moi acp doctor`, nightly probe runs.

## 8. Tracker — upstream issues and moi workarounds

What we are fixing, waiting on, or have decided to work around. Update the
status column as things move; the matrix above describes behaviour at probe
time, this table describes intent.

| #   | Agent  | Problem                                                               | Status                                                                                                                  | moi workaround while open                                                                    | When fixed upstream                                                                   |
| --- | ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | fx     | `session/load` collapses tool calls into prose, drops thoughts (§9.4) | **Reported** — [vercel-labs/fx#624](https://github.com/vercel-labs/fx/issues/624), open, maintainers said they will fix | journal of live events, or read `~/.fx/sessions/<id>/events.jsonl`                           | fx moves to the plain `session/load` path; journal stays as the custom-agent fallback |
| 2   | fx     | startup diagnostics sent as `agent_message_chunk` (§9.3)              | **To report** — ask: stderr or an `_fx/…` extension notification                                                        | drop the first message of a turn starting with `[context]` / `skill discovery warning:`      | delete the `dropDiagnostics` flag                                                     |
| 3   | fx     | one active session per process                                        | Not reporting — tgfx lives with it too; may be by design                                                                | `topology: 'per-session'`                                                                    | could fall back to per-workspace, no urgency                                          |
| 4   | fx     | `currentModeId` says `ask` while the effective policy is `auto`       | To report (low)                                                                                                         | always `set_mode` after new/load/resume (needed anyway)                                      | nothing changes                                                                       |
| 5   | fx     | generic tool `title`, identity only in non-spec `name`                | To report (low) — ask for descriptive titles and `locations`                                                            | per-agent tool vocabulary keyed on `name` + `rawInput`                                       | vocabulary becomes a fallback                                                         |
| 6   | fx     | `set_config_option model` accepts a nonexistent id                    | To report (low)                                                                                                         | validate against the catalog before calling                                                  | keep the validation                                                                   |
| 7   | Hermes | file-tool calls never complete live (Hermes notes §3.4)               | Known, not reported upstream yet; still present in 0.21.0                                                               | close open calls when `session/prompt` resolves (shipped)                                    | keep — harmless                                                                       |
| 8   | Hermes | `set_model` drops session MCP servers (Hermes notes §3.10)            | Not reported; irrelevant until moi attaches MCP servers                                                                 | none needed today                                                                            | —                                                                                     |
| 9   | Cursor | permission prompts for shell and MCP in `agent` mode                  | Not reporting — documented behaviour                                                                                    | `--force` before `acp`                                                                       | —                                                                                     |
| 10  | Cursor | no usage on the wire                                                  | Not reporting for now                                                                                                   | none; no cost/usage shown for Cursor chats                                                   | fold into `TurnMeta` when it appears                                                  |
| 11  | all    | mode resets to default after `session/load`                           | Protocol-level; expected                                                                                                | re-apply the mode on every attach                                                            | —                                                                                     |
| 12  | fx     | no effort control over ACP (§3)                                       | **To report** — ask for `--effort` on `fx acp` or a `thought_level` config option                                       | write `effort` into `~/.fx/settings.json` around `session/new`, or leave effort hidden       | delete the settings hack                                                              |
| 13  | Hermes | no effort control over ACP (§3)                                       | To report (low) — ask for a `thought_level` config option                                                               | write `agent.reasoning_effort` into the profile `config.yaml` before attach, or leave hidden | delete the config hack                                                                |
| 14  | Cursor | effort fixed per catalog variant, not overridable (§3)                | To report (low) — ask for bracket overrides or a `thought_level` option over ACP                                        | none; effort hidden                                                                          | —                                                                                     |
| 15  | all    | subagent activity is one flat tool call (§4)                          | Not reporting — no ACP primitive for nesting                                                                            | flat card; optional Hermes log tail / fx child session read                                  | —                                                                                     |

## 9. Appendix: fx wire shapes

The fx-specific samples the tool mapper, diagnostic filter and disk reader are written against (probed on fx 0.0.7). Full probe modes: `scripts/probe-acp.ts`.

### 9.1 Tool calls carry a `name`; titles are generic

```json
{"sessionUpdate":"tool_call","toolCallId":"chatcmpl-tool-1f8e…","name":"write_file","title":"Writing","kind":"edit","status":"pending","rawInput":{"content":"done","path":"out.txt"}}
{"sessionUpdate":"tool_call","toolCallId":"chatcmpl-tool-c0d6…","name":"shell","title":"Running","kind":"execute","status":"pending","rawInput":{"action":"run","command":"echo hello","shell":{"kind":"executable","path":"/bin/zsh"},"tty":true}}
{"sessionUpdate":"tool_call","toolCallId":"chatcmpl-tool-2cd5…","name":"subagent","title":"Managing","kind":"other","status":"pending","rawInput":{"request":{"action":"run","task":"…"}}}
{"sessionUpdate":"tool_call","toolCallId":"chatcmpl-tool-59bb…","name":"mcp_mini_moi_secret_number","title":"mcp_mini_moi_secret_number","kind":"other","status":"pending","rawInput":{}}
```

- `name` is not in the ACP schema; fx adds it (tgfx's PR #5 "Render tools from
  the names and args fx now sends over ACP" is the moment it appeared). It is
  the only reliable identity — `title` is a one-word gerund ("Running",
  "Writing", "Reading", "Searching capabilities", "Managing", "Asking").
  moi's `acpToolCallToTurn` prefers `title`, which would label every shell call
  "Running": the fx mapper must key on `name` + `rawInput`, exactly what
  tgfx's `describeTool` table does (`src/fx/tools.ts`).
- No `locations` on file tools, so `sidecar.locations` stays empty; the path is
  `rawInput.path`. Some tools wrap arguments in `rawInput.request` (subagent).
- Ids are provider-generated (`chatcmpl-tool-<hex>`), unique per call — no
  repeat-id aliasing needed (contrast Hermes replay, `acp/session.ts`
  `toolCallSeq`).
- `title` in `session/request_permission` is different again
  (`file_mutation`), so the same call has three labels on the wire.

### 9.2 Tool results stream incrementally, then finish with a JSON envelope

The `shell` tool sends **each** output chunk as its own `in_progress` update
with **only the new bytes**:

```json
{"sessionUpdate":"tool_call_update","toolCallId":"…","status":"in_progress"}
{"sessionUpdate":"tool_call_update","toolCallId":"…","status":"in_progress","content":[{"type":"content","content":{"type":"text","text":"moi-env-works-7391\n"}}]}
{"sessionUpdate":"tool_call_update","toolCallId":"…","status":"completed","content":[{"type":"content","content":{"type":"text","text":"{\"session_id\":null,\"state\":\"completed\",\"backend\":\"captured\",\"persistence\":\"process\",\"output_truncated\":false,…,\"exit_code\":0,…}"}}],"command_result":{"kind":"command","command":"printenv MOI_TEST_ENV","cwd":"…","exit_code":0,"signal":null,"timed_out":false,"duration_ms":null,"stdout_bytes":19,"stderr_bytes":0,"truncated":false,…}}
```

- moi's adapter keeps "whichever text we have most recently seen", which would
  **replace** streamed output with each chunk and then with the envelope. The
  fx mapper must **append** `in_progress` content and treat the `completed`
  payload as metadata, not output. The envelope is fx's internal shell-tool
  result (`session_id`, `backend: tty|captured`, `full_output_handle`, …);
  the human-relevant bits are in the non-spec `command_result` sibling
  (`command`, `cwd`, `exit_code`, `duration_ms`). tgfx preserves
  `command_result` "as ACP raw output before schema validation" (SPEC).
- A yielded/background shell run reports `completed` while the process is
  still running (`"state":"running"`, `session_id: "shell-1"`), then streams
  late output as further `in_progress` updates on the same id. tgfx's
  projector pins a finished row finished ("fx marks a yielded `run`
  completed, then streams the command's late output as `in_progress`").
- `write_file` completes with prose (`wrote gated.txt (17 bytes)`) and no
  diff on the wire, although the on-disk event log has a full
  `committed_file_presentation` diff for it (§9.5). `read_file` returns
  `<path>…</path>\n<content>\n1\tdone\n</content>` with line numbers.
- Failures are `status: failed` with the error as text; permission denials
  come back as a JSON `{"error":{"type":"tool_permission_denied",…}}` string,
  and a held action as `{"error":{"type":"tool_review_held",…}}` (§5.3).

### 9.3 Startup diagnostics leak into the assistant stream

Every turn starts with one or two `agent_message_chunk`s that are **not model
output**:

```
[context] skill catalog omitted 64 entries (careful, claude, …, +56 more): observed=56618 bytes effective=16384 bytes source=compiled default; override with --context-limit skill_catalog_bytes=BYTES|off
skill discovery warning: candidate "/Users/molefrog/.claude/skills/react-pdf" was skipped because its metadata is invalid (unsupported_multiline); …; relaunch with FX_TRACE=1 to write a trace log
```

They share one `messageId` that differs from the real answer's, so they can be
dropped by id (first message of the turn whose text starts with `[context]` /
`skill discovery warning:`) rather than by regex — tgfx uses a regex
(`diagnosticOffset` in `projector.ts`). `--context-limit
skill_catalog_bytes=off` removes the `[context]` line but stuffs the whole
56 KB catalog into the prompt (turn cost went 11.8k → 22.2k tokens), and the
skill warning still leaks. moi should render these as a `SystemNotice` (or
drop them), never as assistant text. A rejected embedded resource produces the
same kind of chunk (`[context] project instructions action=omitted reason=unsafe
target …`, §3).

### 9.4 What replay sends

`session/load` on the `stream` session (5 tool calls, thoughts, one answer)
replayed **three** frames:

```json
{"sessionUpdate":"user_message_chunk","messageId":"0667…","content":{"type":"text","text":"Run 'echo hello' in the shell, …"}}
{"sessionUpdate":"agent_message_chunk","messageId":"2a9f…","content":{"type":"text","text":"Previous tool execution:\n\nTool shell (failure):\nshell arguments must match the advertised action schema\n\nTool shell (failure):\n…\n\nTool shell (success):\n{\"session_id\":null,…"}}
{"sessionUpdate":"agent_message_chunk","messageId":"f813…","content":{"type":"text","text":"'echo hello' printed \"hello\" with exit code 0, …"}}
```

Tool history is **flattened into a prose chunk** ("Previous tool execution:
… Tool shell (success): …") — no `tool_call`/`tool_call_update`, no
thoughts, no timestamps, no usage. That prose is presumably what fx feeds the
model on resume, leaked verbatim to the client. In moi it would render as a
wall of assistant text with embedded JSON envelopes instead of tool cards.
The e2e "replay tool pairing" step fails for this reason (0 starts / 0
updates for a 3-call turn).

`session/resume` attaches to the session with no replay at all (one
`session_info_update`) and the model remembers the conversation. That is the
right call for a host that keeps its own transcript.

### 9.5 The on-disk store has everything, with timestamps

`~/.fx/sessions/index.json` (`schema_version: 3`) is a flat list, one row per
session, cheap to read:

```json
{
  "id": "fziAqm9wY0d-",
  "created_at_ms": 1788417066330,
  "updated_at_ms": 1788417092400,
  "workspace_root": "/…/ws-stream",
  "origin_workspace_root": "/…/ws-stream",
  "history_len": 1,
  "has_managed_children": false,
  "title": "Run 'echo hello' in the shell, then write",
  "preview": "Run 'echo hello' in the shell, then write out.txt containing 'done', …"
}
```

That alone covers `listSessions()` (filter by `workspace_root`) **and**
`workspacePreview()` (`preview` = first user message, `updated_at_ms`) with no
process spawn — the cheap home-card path Hermes cannot offer.

Per session, `~/.fx/sessions/<id>/`:

| File                                                                   | Contents                                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `session.json`                                                         | `preferences: { model, effort, fast_mode, provider }`, token totals, `history_len`, event-log fingerprint            |
| `display.json`                                                         | `title`, `preview`, `origin_workspace_root`                                                                          |
| `events.jsonl`                                                         | append-only event log (`session_started`, `recovery_checkpoint_set`, `usage_checkpointed`, `history_turn_committed`) |
| `checkpoint.json`                                                      | materialized state through a seq: preferences, `permission_state.rules`, usage, `recovery_checkpoint`                |
| `usage-v2.json`                                                        | per-model cost/tokens incl. `cache_read_tokens`, `reasoning_tokens`, `lines_added/removed`, wall/api durations       |
| `terminal/`, `logs/commands`, `artifacts/`, `subagent/`, `background/` | shell session state, command logs, fetched pages, child sessions                                                     |

`history_turn_committed.payload.turn` is the full-fidelity turn:

```
turn.kind                       "assistant"
turn.user                       { text, images[] }
turn.assistant                  final answer text
turn.execution.tool_steps[]     { assistant: string|null,
                                  tool_calls[]:   { id, name, arguments_json, provider_result },
                                  tool_results[]: { tool_call_id, tool_name, status: success|failure, output,
                                                    created_at_ms, permission_feedback[],
                                                    committed_file_presentation: { path, kind: added|…, lines[{kind,old_line,new_line,text}], additions, deletions, after_content },
                                                    command_output_replay, command_process_presentation, terminal_action_presentation } }
```

So a disk-based `sessionEvents()` can rebuild user turns, tool cards with
inputs/outputs/status, **file diffs**, per-step timestamps and per-turn usage —
strictly more than the wire replay, and comparable to the Claude Code
`.jsonl` path. Thoughts are not persisted anywhere. `recovery_checkpoint_set`
events (12 per turn here) snapshot the in-flight turn, which is how fx resumes
an interrupted turn. The format is private (`storage_format: event_log_v1`,
`schema_version: 3`), so pin a schema check and fall back to `session/load`.

Recommended shape for moi: live turns from the wire, cold loads from the
journal or this log, and `run-durations.ts` retired because `created_at_ms`
is real.
