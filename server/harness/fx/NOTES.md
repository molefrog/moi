# fx over ACP

The minimum supported fx version is **0.0.9**. Verified on 2026-09-25 with
stable `0.0.11` (revision `dc870f3a9174`) against real Gateway models, and on
2026-09-12 with the exact stable `0.0.9`, revision
`e26e97ec4040827b86a1c70c62273e0a8546d3e5`, and official dev `0.0.9`, revision
`50252617707bcd7ba961d938f82a0c3c85a60230`. Older builds, including the
earlier dev `0.0.8` pin below, are unsupported.

## Installation

Install fx using its [official instructions](https://fx.sh/docs), or run
`fx upgrade` on an existing installation. Check `fx --version` for `0.0.9`
or later and `fx status` for `build_revision`. Sign in with `fx login`, `fx login codex`,
or `fx login grok` before opening a chat in moi. The selected provider and
credentials stay owned by fx; moi does not change profile settings.

The immutable [macOS arm64 artifact](https://releases.fx.sh/dev/50252617707bcd7ba961d938f82a0c3c85a60230/fx-macos-aarch64.tar.gz)
passed its published SHA-256 checksum. The previous dev executable is
preserved at `~/.local/bin/fx.backup-f4ea28b23764`; the original stable backup
remains at `~/.local/bin/fx.backup-v0.0.8`. The update channel and login were
left unchanged.

## Integration

- Availability and every ACP launch check the resolved executable's version,
  including discovery and history loading. Older versions show upgrade
  instructions; failed or unrecognized checks report a separate setup error.
  Checks are bounded and repeated so replacing the executable takes effect.
- One owned ACP process per chat. Discovery uses a separate process: fx has
  only one active session per process, and creating/loading another replaces it.
  Listing chats reuses one warm process per workspace, released 30 seconds
  after the last list: fx answers `session/list` from disk without touching
  an active session, and every chat end refreshes the list in each open tab.
- `session/load` restores the actual model context and replays structured
  tool cards. Load errors propagate rather than appearing as an empty chat.
- `code` mode is reapplied after creation/load. It automatically reviews
  unresolved sensitive actions and can hold them; it is not full access.
- Model selection uses `configId: model`, never the first `category: model`
  option: fx gives its separate provider selector the same category. fx
  names each of its few hundred Gateway models by its `vendor/model` id; the
  picker lists them by model name under vendor headings (`claude-opus-5.5`
  under Anthropic) and keeps the id as the value.
- Reasoning effort uses `configId: effort`, category `thought_level`.
  Changes are validated against the returned options, confirmed, persisted
  with the session, and applied before the next prompt. No global settings
  file is rewritten. fx advertises effort only for a session's current model,
  so when the picker selects a model moi has not seen, a throwaway discovery
  session switches to it and the advertised options are cached
  (`GET /agent?model=…`); its first chat can already choose effort. Models
  known to have no effort report it and are not probed again.
- Imported chats report their native model and effort to the composer.
  Explicit moi chat preferences take precedence; loading or sending with
  native defaults does not save new overrides. A native effort is not carried
  to a different pending model selection. Sending waits for settings to load,
  and failed loads expose the existing retry action.
- Native tool names identify cards; wrapped inputs and file paths are kept.
  fx's generic titles such as `Running`, `Reading` and `Waiting for` are
  replaced with the tool and its action (`Wait for command shell-1`,
  `Read skill moi-workspace`, `Fetch webpage https://…`), live and replayed.
  Read results are unwrapped from fx's `<path>`/`<content>` envelope and
  highlighted, writes show the written file, and edits render as a diff
  with fx's line counts (`+2 −1`) in the summary.
- Other model-facing envelopes are unwrapped as well, with a raw switch that
  keeps the original: a subagent's report and `vision` image summaries render
  as markdown (`Visible text: …` in the summary), a fetched page as its text
  (`200 · text/html` in the summary), a skill as its highlighted `SKILL.md`,
  saved command output with its `\xNN` escapes decoded (`Bytes 1–29 of 29`),
  and file searches as bare paths under fx's `No matches for …` or count line.
- Shell progress deltas accumulate. A final execution envelope keeps the
  streamed output; `command_result` drives a footer such as `Exit code 0 ·
5.2 s`, `Stopped after 9.3 s` or `Timed out`. A command that outlives its
  `yield_time_ms` completes with a `running` envelope ("Moved to the
  background as shell-1") and fx then streams its late output onto that
  finished call; moi appends it without reopening the row. A row without
  output of its own shows its status in the summary line instead of an
  output box (`No output · Exit code 0 · 0.1 s`). Other tool
  outputs retain ACP's replacement semantics, including explicit empty
  content. fx's `{"error":{…}}` failures render as their message (with
  reviewer advice for a held action).
- ACP clips every tool result to a 200-byte preview, live and on
  `session/load`. After each run and on every history load, moi reads
  `fx session --id <id> --json` and replaces the previews with fx's saved
  results: full command output with its exit code, full tool text (capped at
  64,000 characters), and fx's committed line diff for writes and edits.
  The read takes a few milliseconds and works while the chat's process
  holds the session.
- Context/skill discovery warnings remain visible as operational notices, as
  do fx's other operational messages: provider failures (`HTTP 502: …`,
  `… authentication failed · HTTP 401`, after which the prompt ends
  `refused`), the `[Response interrupted. Restarting.]` marker, and the
  `cancelled`/`failed` outcome fx replays for an interrupted turn. A stopped
  run gets the same "This run was stopped before it finished." notice live.
- A message sent while a run is in progress waits in moi's per-chat queue
  until that run ends. The chat shows it as a dimmed "Queued" bubble after
  the running reply and places it in the transcript when it is dispatched.
- Until fx names a chat (its generated title arrives at the end of the first
  run), the chat list and header use the first message instead of a generic
  placeholder.
- A replay labels only its latest run with the model `session/load` reports;
  fx's replay carries no per-run model, and a send that resumes a chat no
  longer stamps its history with the newly picked model.
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

### September 25, version 0.0.11

An independent JSON-RPC client drove `fx acp` against a scripted local model
(no account) to re-check each ACP finding; the results are in the
[ACP notes](../acp/NOTES.md#september-25-addendum-fx-0011). Real runs then
used the Vercel AI Gateway with four models at High effort.

The thinking probe (`PROBE_EFFORT=high bun scripts/probe-fx-thinking.ts`,
same probability problem as before) confirmed High on every model:

| Catalog model               | Effort levels advertised                  | Live thought chunks | Reasoning characters in moi | Cold reasoning characters |
| --------------------------- | ----------------------------------------- | ------------------: | --------------------------: | ------------------------: |
| `moonshotai/kimi-k3`        | auto, none, low, high, max                |                 574 |                       3,073 |                         0 |
| `zai/glm-5.3`               | auto, low, high, max                      |                 398 |                       2,919 |                         0 |
| `anthropic/claude-opus-5.5` | auto, low, medium, high, xhigh, max       |                   0 |                           0 |                         0 |
| `openai/gpt-6-sol`          | auto, none, low, medium, high, xhigh, max |                   0 |                           0 |                         0 |

All four answered `20/51` (GLM as `$\dfrac{20}{51}$`), with no harness errors
or truncation, and every answer survived cold replay.

A browser matrix then ran each model through the app: markdown, file
writes/edits/reads, shell (streaming, failing, long output, a command that
outlives `yield_time_ms`), stop, queued follow-ups, web fetch and subagents,
image input, and cold reload. It found 22 distinct defects (4 high, 10
medium, 8 low). Each was re-checked against the code and fx's source before
fixing: 19 were moi defects and are fixed. The other three are fx behavior
listed under remaining limits: Stop cannot end a backgrounded command, usage
arrives under non-ACP field names, and replay omits thinking.

### September 12, version 0.0.9

The exact stable release artifact passed its official SHA-256 check. Real
Sonnet/High file execution, structured cold replay, generated titles, and
effort persistence passed. The stable lifecycle probe passed all 16 checks:
concurrent chats, cancellation (40 ms acknowledgement), continued messaging,
live shell output, inline image recognition, discovery, and cold history.
Both installed backups reporting `0.0.8` were rejected by the version gate;
the stable and dev `0.0.9` binaries were accepted.

A native chat created directly with stable fx and Luna/High was imported into
the running app, whose workspace default was GLM. The browser showed Luna/High,
sent a real follow-up with those settings, and retained both after a page
reload. The wire contained no model/effort changes, and moi's stored overrides
remained empty. Tests cover settings loading, explicit overrides, load errors,
new-chat initialization, and queued sends during settings confirmation.
The browser also queued a second message during a new GLM/High run. The wire
confirmed `high` before the first prompt; both prompts completed without
settings reverting or harness errors, and the composer retained GLM/High.

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
  and replay streams. moi restores full results from
  `fx session --id <id> --json` after each run and on load; until that read
  finishes (or if it fails), a replayed shell row says its output is
  unavailable. A command still running in the background keeps its live
  stream instead. fx's history keeps command output, not interleaved
  stdout/stderr, and caps very large results with an output handle.
- fx 0.0.11 reports prompt usage as `reasoningTokens`, `cacheReadTokens` and
  `cacheWriteTokens` instead of ACP's `thoughtTokens`, `cachedReadTokens` and
  `cachedWriteTokens`, and omits the required `totalTokens`; moi derives the
  total. Context size and cost from `usage_update` are not shown yet.
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
  this integration does not read fx's private history format. Idle chats
  release their process after ten minutes but keep moi's live transcript in
  memory (up to 50 chats), so only a moi restart, an environment change or a
  chat continued outside moi falls back to the lossy replay.
- fx replays an interrupted turn without the tool call that was running;
  moi shows its `cancelled`/`failed` outcome as a notice. A tool cancelled
  before it ran (still waiting on review) gets no terminal update from fx;
  the shared ACP layer marks it interrupted rather than inventing success.
- Stopping a run does not stop a command fx already moved to the
  background: its late output keeps arriving on the finished row. fx ties a
  command to the turn's cancellation only for its first 30-second
  observation window; after that it is an owned shell session that only
  `shell.stop` or process exit ends, and ACP has no request for either.
- A turn whose only work was thinking loses its "Worked for" label after a
  cold replay, because the replay omits that thinking.
- Probing a model's effort options creates an empty fx session, like model
  discovery; moi hides it, but it remains in fx's own history.
- Workspace-wide effort defaults use `auto`; another chat's selected effort
  is not treated as a provider default. Imported chats use their own native
  model and effort unless explicitly overridden in moi.
- fx 0.0.9 generates titles from the first prompt and moi reflects them.
  Older/imported chats can remain `Untitled session` when fx has no saved
  title and the chat is not open in this server. Nested subagent views, a
  provider picker, fast mode, and fork UI are v1 omissions, not claims that
  the protocol makes them impossible.
- Native fx does not implement ACP `session/remove`: the parsed method is
  implemented only in its WASM runtime; native dispatch returns `-32601`.
  `session/close` flushes and releases the session without deleting it, and
  the installed `fx session` CLI has no delete operation. Model discovery's
  empty saved sessions therefore cannot be removed through those interfaces.
- moi queues follow-ups. No working ACP steering method was established;
  native interactive fx steering does not prove ACP support.
- fx supports inline images up to 3.75 MiB each and embedded resources;
  audio is unsupported. Inline vision was verified with Sonnet 5, Kimi K3,
  Opus 5.5 and GPT-6 Sol. `zai/glm-5.3` has no native vision: fx gave it its
  `vision` tool, which read the image and answered correctly. MCP image
  results were not exercised.
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
