# fx over ACP

Verified again on 2026-09-12 with official dev `0.0.9`, revision
`50252617707bcd7ba961d938f82a0c3c85a60230`. Stable `0.0.9`, revision
`e26e97ec4040827b86a1c70c62273e0a8546d3e5`, now includes ACP effort and
structured history replay. Stable `0.0.8`, revision `43c11dcc34a9`, predates
those features; the earlier dev `0.0.8` pin below already included them.

## Installation

Install fx using its [official instructions](https://fx.sh/docs), or run
`fx upgrade` on an existing installation. Use version `0.0.9` and check
`fx status` for `build_revision`. Sign in with `fx login`, `fx login codex`,
or `fx login grok` before opening a chat in moi. The selected provider and
credentials stay owned by fx; moi does not change profile settings.

The immutable [macOS arm64 artifact](https://releases.fx.sh/dev/50252617707bcd7ba961d938f82a0c3c85a60230/fx-macos-aarch64.tar.gz)
passed its published SHA-256 checksum. The previous dev executable is
preserved at `~/.local/bin/fx.backup-f4ea28b23764`; the original stable backup
remains at `~/.local/bin/fx.backup-v0.0.8`. The update channel and login were
left unchanged.

## Integration

- One owned ACP process per chat. Discovery uses a separate process: fx has
  only one active session per process, and creating/loading another replaces it.
- `session/load` restores the actual model context and replays structured
  tool cards. Load errors propagate rather than appearing as an empty chat.
- `code` mode is reapplied after creation/load. It automatically reviews
  unresolved sensitive actions and can hold them; it is not full access.
- Model selection uses `configId: model`, never the first `category: model`
  option: fx gives its separate provider selector the same category.
- Reasoning effort uses `configId: effort`, category `thought_level`.
  Changes are validated against the returned options, confirmed, persisted
  with the session, and applied before the next prompt. No global settings
  file is rewritten. The picker retains each model's advertised effort
  options once discovered; switching models refreshes that knowledge.
- Native tool names identify cards; wrapped inputs and file paths are kept.
  fx's generic titles such as `Running` and `Reading` are replaced with the
  native tool identity, so both live and replayed cards remain identifiable.
  Shell progress deltas accumulate. A final execution envelope preserves
  streamed output and execution metadata. Other tool outputs retain ACP's
  replacement semantics, including explicit empty content.
- Context/skill discovery warnings remain visible as operational notices.
- Live `agent_thought_chunk` updates become reasoning parts. fx can omit
  their `messageId` immediately after a diagnostic that has one; moi closes
  the diagnostic before accumulating reasoning so the warning cannot swallow
  the model's thinking or contaminate its live preview.
- Archiving hides a chat in moi and releases its owned work. It does not
  delete fx history. Workspace skills live in `.agents/skills`.
- Model discovery archives only its newly created empty session through
  moi's existing archive store, keeping the chat list clean. That empty
  history remains in fx itself and can still appear in the fx CLI.

## Verification

### September 12, version 0.0.9

The ACP effort selector, model-switch consistency fix, and Gateway v4 effort
fix in the 0.0.9 release were already present in the September 11 dev pin
`f4ea28b23764a67b9054b357b2e3ac81a12b9138`. New changes since that pin include
first-prompt generated chat titles and preserving tool-result bytes for model
processing/storage. The ACP thought/replay protocol itself is unchanged.

Real Sonnet file reads retained structured tool input/output after a cold load,
and High effort persisted. The fake Gateway probe now answers background title
generation separately so it cannot consume the chat's queued tool response.
It parses chat requests separately from titles/classification and verifies
`reasoning: high` on every chat request, including the tool continuation.

The browser created a chat using GLM/Low; the wire confirmed `effort: low`,
the model answered, and the header updated to its generated title,
`Exact Token Response Request`.
A separate real chat switched GLM/Low to Luna/High. The wire confirmed the
model change, then effort, before the second prompt. A cold load through the
ordinary provider configuration restored Luna/High and both replies.

The real thinking probe used a fresh 247-model catalog and the same probability
problem as the baseline. All incoming thinking characters reached moi intact;
all final answers and explicit High settings survived cold loading.

| Catalog model                      | Effort                 | Live thought chunks | Reasoning characters in moi | Cold reasoning characters |
| ---------------------------------- | ---------------------- | ------------------: | --------------------------: | ------------------------: |
| `anthropic/claude-sonnet-5`        | High                   |                   0 |                           0 |                         0 |
| `openai/gpt-5.6-luna`              | High                   |                 187 |                         935 |                         0 |
| `zai/glm-5.3-flash`                | High                   |                 576 |                       3,754 |                         0 |
| `alibaba/qwen3-235b-a22b-thinking` | No selector advertised |               4,604 |                       9,929 |                         0 |

No harness errors, tool calls, or capture truncation occurred. GLM answered
`20/61` instead of `20/51`; the other three answered correctly. Luna emitted
thinking today after emitting none yesterday. Since the upstream thought
transport did not change, this observation alone does not attribute the
difference to the binary update.

### September 11 baseline

Desktop browser verification created an fx workspace, selected Sonnet 5,
wrote and read `fx-ready.txt`, switched effort to High, and ran a follow-up.
After a full moi server restart, both answers and the structured file results
returned, and the composer restored Sonnet 5 with High effort.
A second chat completed with `openai/gpt-5.6-luna` and Auto effort; returning
to the already-open Sonnet chat retained High and its file results. The chat
list contained only these two user-created chats after discovery cleanup.

This machine's existing `react-pdf` skill produced an `unsupported_multiline`
metadata warning from fx. The integration surfaced it without interrupting
the run; the user's global skill was left unchanged.

`bun test server/harness/fx` covers selector ambiguity, grouped options,
unsupported selections, confirmation failures, effort changes after model
switches, shell output, ordinary final text, and explicit empty output.

`PROBE_EFFORT=high bun scripts/probe-fx-acp.ts --fake` drives the real binary
through moi's actual ACP client/session/adapter. The fake gateway advertises
effort levels, verifies `reasoning: high` reached the model request, executes
a real file read, and checks session discovery and cold replay.

`PROBE_EFFORT=high bun scripts/probe-fx-acp.ts --real` uses the existing fx
login in a disposable workspace. The real Vercel AI Gateway model
`anthropic/claude-sonnet-5` advertised `auto`, `low`, `medium`, `high`, and
`xhigh`; `high` was confirmed, the read completed, and cold replay preserved
the tool name, input, successful status, and output. These probes save no moi
workspace. Real-login probes leave their disposable test chats in fx history.

Temporary workspace paths are canonicalized: macOS `/var` is a symlink to
`/private/var`, and fx's exact cwd filter otherwise misses the saved chat.

`bun scripts/probe-fx-lifecycle.ts` exercises the real model in a disposable
workspace under the user's home. All 16 checks passed: two chats active at
once; cancellation acknowledged in 77 ms with a failed shell result and no
false success; the other chat's shell completed; the stopped chat accepted a
follow-up; all three chats were discovered and cold-loaded. A 327-byte shell
stdout survived live completion. A generated PNG held six random digits that
were absent from the prompt and any readable file; the model returned the
digits exactly without calling tools, and the image and answer survived replay.

This probe exposed a completion bug: the shell result envelope is clipped
inside its JSON string at 200 bytes. The fx normalizer now recognizes that
specific prefix, preserves live stdout, and retains the incomplete envelope
as metadata. The regression is covered by the 14 fx unit tests. Cold shell
replay has no stdout deltas; its explicit output-limit notice is verified.

### Real thinking models, September 11 baseline

`PROBE_CATALOG=/path/to/agent-catalog.json bun scripts/probe-fx-thinking.ts`
checks the selected models against a saved `GET /api/workspaces/:id/agent`
catalog and runs each through the real authenticated Gateway. It saves
complete wire/client captures and live versus cold summaries under
`~/.cache/moi-fx-thinking-*/`. Optional positional model ids limit the run.
It uses the same probability problem for each model and asks for a short
answer without tools; reasoning is whatever the provider independently emits.

| Catalog model                      | Confirmed effort       | Live thought chunks | Reasoning characters in moi | Cold reasoning characters |
| ---------------------------------- | ---------------------- | ------------------: | --------------------------: | ------------------------: |
| `anthropic/claude-sonnet-5`        | High                   |                   0 |                           0 |                         0 |
| `openai/gpt-5.6-luna`              | High                   |                   0 |                           0 |                         0 |
| `deepseek/deepseek-v3.2-thinking`  | No selector advertised |                   0 |                           0 |                         0 |
| `alibaba/qwen3-235b-a22b-thinking` | No selector advertised |               4,301 |                       9,346 |                         0 |
| `zai/glm-5.3-flash`                | High                   |                 395 |                       2,453 |                         0 |

All five completed without harness errors, tools, or capture truncation;
every final answer survived cold replay. Four returned the expected fraction;
DeepSeek returned a different answer. This checks stream delivery, not general
model accuracy or a guarantee that a model always exposes thinking.

A separate browser GLM/High run exposed and verified the diagnostic isolation
fix: before it, 279 thought chunks (1,549 characters) were swallowed by a
preceding skill warning. After it, all 401 chunks (2,269 characters) remained
in the completed turn and were readable under **Worked for… → Thought**.
The captured order is covered by ACP lifecycle regression tests, including
short live thoughts, later warnings, thought-only completion, and cancellation.

## Remaining limits

- Terminal tool updates are clipped upstream to a 200-byte preview in live
  and replay streams. Live shell stdout arrives separately and is retained;
  cold shell replay can contain only a clipped execution envelope, so moi
  explicitly reports that command output is unavailable. Permission/review
  failures preserve their text; binary
  output becomes a notice. Full output/diffs remain accessible via
  `fx session --id <id> --json`, but this integration does not enrich cards
  from that command yet.
- ACP replay supplies no original message timestamps or per-turn token usage.
  moi restores its own measured run durations only when recorded and replayed
  run counts match; imported histories have no such measurements. Historical
  usage/timestamp enrichment needs another source, not inferred replay times.
- Thinking text is model-dependent even when High effort is confirmed.
  GLM and Qwen emitted thinking on both dates; Luna did so only in the
  September 12 run, and Sonnet did not in either run. Effort selection does
  not guarantee visible thinking.
- Cold ACP replay omits thinking. For the verified GLM run, fx stored a
  1,549-character reasoning part in its private provider replay events, but
  both `session/load` and `fx session --id <id> --json` omit it. Restoring
  thoughts needs an upstream replay change or a separate moi history cache;
  this integration does not read fx's private history format.
- Cancellation can leave a tool without a terminal update. The shared ACP
  layer preserves an interrupted outcome rather than inventing success.
- A model's effort choices become available after fx first advertises them
  during creation, restoration, or a model switch. moi retains known choices
  across chats but does not guess support for models that have not been used.
- Native fx chats imported into moi keep their backend model/effort until
  overridden, but the picker does not automatically adopt native settings
  into moi's saved chat preferences. Select the intended model and effort
  explicitly for these chats. Workspace-wide effort defaults use `auto`;
  another chat's selected effort is not treated as a provider default.
- fx 0.0.9 generates titles from the first prompt and moi reflects them.
  Older/imported chats can remain `Untitled session` when fx has no saved
  title. Full-output enrichment, nested subagent views, a provider picker,
  fast mode, and fork UI are v1
  omissions, not claims that the protocol makes them impossible.
- Native fx does not implement ACP `session/remove`: the parsed method is
  implemented only in its WASM runtime; native dispatch returns `-32601`.
  `session/close` flushes and releases the session without deleting it, and
  the installed `fx session` CLI has no delete operation. Model discovery's
  empty saved sessions therefore cannot be removed through those interfaces.
- moi queues follow-ups. No working ACP steering method was established;
  native interactive fx steering does not prove ACP support.
- fx supports inline images up to 3.75 MiB each and embedded resources;
  audio is unsupported. Inline vision and image replay were verified with
  Sonnet 5; other models and MCP image results were not exercised.
- ACP excludes `~/.fx/mcp.json`. It accepts client-supplied servers and
  approved workspace `.mcp.json` servers; moi currently supplies no extra
  servers. Project MCP trust remains managed in fx.
- Instruction discovery may omit instructions outside the user's home;
  the resulting warnings remain visible.

Sources: [0.0.9 release](https://github.com/vercel-labs/fx/releases/tag/v0.0.9),
[ACP documentation](https://fx.sh/docs/using-fx/acp),
[structured replay #788](https://github.com/vercel-labs/fx/pull/788),
[effort support](https://github.com/vercel-labs/fx/commit/32f3dc9ee07b9649ce10d6b24d1e30af0e20302a),
[effort catalog consistency](https://github.com/vercel-labs/fx/commit/726cea85953b38317cdb200ac06cf8cf6ecdc705),
and [pinned session implementation](https://github.com/vercel-labs/fx/blob/50252617707bcd7ba961d938f82a0c3c85a60230/src/acp/sessions.zig).
