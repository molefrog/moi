# ACP agents — verified behavior and implementation plan

Updated 2026-09-05 (Asia/Nicosia). These notes replace the original conformance
report and its implementation plan. Findings, verification limits, and proposed
solutions are consolidated here. The fixes below are not implemented.

**Fix moi's session lifecycle and protocol mapping before adding providers.**
The independent host probe exposed twelve failed behavior checks despite all
42 existing ACP tests passing. Provider compatibility then needs a few focused
hooks: fx process isolation and history retrieval, Hermes completion/usage
handling, and Cursor config/replay support. A generic journal, workspace-type
migration, and custom-agent registry are not prerequisites.

## 1. Evidence and verification

Fresh tests ran against moi `9bfd2ed` and `@agentclientprotocol/sdk@1.3.0`:

| Agent  | Command            | Installed version             | Model used                          |
| ------ | ------------------ | ----------------------------- | ----------------------------------- |
| Hermes | `hermes acp`       | `0.21.0`, source `d3630f8532` | `xai-oauth:grok-build-0.1`          |
| fx     | `fx acp`           | `0.0.7`                       | `zai/glm-5.3-flash`                 |
| Cursor | `cursor-agent acp` | `2026.09.02-c22c1a3`          | `auto-smart[optimize_for=balanced]` |

fx source was inspected at `7e02f32f7fca`; the installed binary reports only
`0.0.7`, so that commit is corroborating source, not a proven binary identity.
Hermes source was inspected in the installed checkout at the revision above.

Fresh independent JSON-RPC probes exercised creation, config rejection, real
shell/write/read operations, injected environment values checked against the
resulting file, multiple sessions, cold list/load/resume, nonexistent sessions,
nondefault modes, cancellation during tools, and broken MCP startup. Hermes
steering was exercised during an active shell call. The host probe separately
drove moi's actual ACP client, session, and adapter through a mock subprocess.

Images, successful MCP calls, permission-denial behavior, Cursor `--force`, and
subagent transcripts have **historical capture evidence only**. Those captures
were inspected but these cases were not freshly rerun. The old matrix script
and mini-MCP script are absent from this checkout and its available git history;
the old command examples no longer apply. Aggregate pass/fail rankings have
been removed: optional methods are not conformance failures, and an RPC
acknowledgement does not prove that a setting took effect.

The one-off probe scripts and separate audit artifacts are not retained in the
repository. To repeat the provider checks, use an independent JSON-RPC client
with the commands above, existing authentication, and disposable workspaces.
Test nondefault modes before and after restarting the process, cancel while a
tool is active, and verify file contents against a random environment marker.
Restore the confirmed model after rejection tests. For host regressions, use
the observed failures and acceptance criteria in §5; run the existing suite
with `bun test server/harness/acp`.

The audit did not upgrade agents, temporarily edit global settings, or file
upstream issues. Fresh raw captures were stored in `/tmp/moi-acp-audit.f4Uoya/`;
historical captures were inspected under
`/tmp/claude-501/-Users-molefrog-git-moi/645be88d-e045-49f1-a68a-66b70769f71e/scratchpad/`.
These temporary paths may disappear and are not durable test dependencies.

## 2. Verified compatibility summary

These are observations for the tested builds, not promises about every model,
provider configuration, or future version. See the following sections for
limitations and solutions.

| Behavior                                      | Hermes                                  | fx                                                     | Cursor                                                      |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| Earlier session usable after creating another | Yes in sequential test                  | No: `Session is not active`                            | Yes in sequential test                                      |
| Model configuration                           | Legacy `models` / `session/set_model`   | `configOptions`; distinct provider and model selectors | `models` and `configOptions`; exact parameterized model IDs |
| Independently settable effort                 | Not verified; current path omits config | Unknown effort option is inert                         | No separate override established; use catalog variants      |
| Live tool completion                          | File calls remain unsettled             | Output deltas and final shell envelope                 | Paired updates; inputs/output may arrive after start        |
| Cold `session/load`                           | Structured replay                       | Tool history flattened into assistant prose            | Structured replay                                           |
| `session/resume`                              | Supported, also replays                 | Attaches without replay                                | Method not found in tested build; use load                  |
| Load nonexistent session                      | Returns `{}`                            | Error                                                  | Error                                                       |
| Changed mode after warm load                  | `dont_ask` preserved                    | `code` resets to `ask`                                 | `plan` preserved                                            |
| Changed mode after cold load                  | Resets to `default`                     | Resets to `ask`                                        | `plan` preserved                                            |
| Cancel during a tool                          | Internal error in finalization          | `cancelled`, tool left unsettled                       | `cancelled`, tool left unsettled                            |
| Mid-turn steering                             | `/steer` prompt works                   | No equivalent verified                                 | No equivalent verified                                      |
| Broken stdio MCP executable on creation       | Returns a session ID                    | Rejects creation                                       | Returns a session ID                                        |
| Prompt usage                                  | Cumulative agent counters               | Input/output observed                                  | None observed                                               |
| Context usage update                          | Observed                                | Observed, including cost                               | None observed                                               |
| Alternative history path                      | Local SQLite exists; prefer replay      | Supported `fx session --id <id> --json`                | Local store contains plaintext/JSON; prefer replay          |

The Hermes/Cursor sequential test does not prove unrestricted concurrent
session isolation. A safe default for unfamiliar agents is a dedicated process
per open chat. Process sharing should be an explicit provider optimization,
not a destructive runtime probe against a user's active sessions.

## 3. Shared protocol rules

### Tool updates replace collections

The installed SDK explicitly defines `ToolCallUpdate.content` and `locations`
as replacements. An omitted field preserves its previous value; an explicit
`[]` clears it. moi currently fails to clear both and drops `rawOutput`.
Preserve structured diffs and outputs instead of flattening them to `newText`.

`rawOutput` and `UsageUpdate.cost` are standard fields in SDK 1.3.0; cost is a
cumulative session value. `ToolCall.name` is present as an **unstable** field.
fx's `command_result` is an extension. Do not discard useful standard fields
as unknown provider extras. See [tool calls](https://agentclientprotocol.com/protocol/v1/tool-calls).

fx's incremental shell output needs an fx-specific normalization hook that
produces replacement snapshots for the shared adapter. Recognize its shell
completion envelope before treating it as metadata; retain legitimate final
text and failures. A global append rule duplicates cumulative snapshots and
can hide the final result.

### Supplied message IDs define boundaries

Two adjacent assistant messages with IDs `a` and `b` currently collapse into
one `onetwo` message. Flush on supplied identity changes for both user and
assistant messages. Use role/tool boundary heuristics only when IDs are absent.
Keep IDs opaque, including literal newlines. Live and replay IDs need not match:
fresh Hermes replay used `call-…`, Cursor replay used `replay-…`, and both
used different live IDs. The old Hermes `functions.<tool>:<n>` replay format is
not universal. Do not reconcile persisted history through ephemeral wire IDs.

### Configuration belongs to a session

Support advertised `configOptions` and legacy `models`/`modes`, including grouped
values and config updates. Keep selected values separate from the catalog cache.
Prefer known preset option IDs; semantic categories are a fallback, not unique
keys. fx marks **both** `provider` and `model` with category `model`.

Other ACP agents can expose `thought_level`; detect it instead of declaring
ACP incapable of effort control. Return only confirmed model/config selections
and surface rejected changes. See [session config options](https://agentclientprotocol.com/protocol/v1/session-config-options).

Modes are not a portable permission policy: `code` or `agent` does not imply
bypass. Apply an explicit preset policy and answer permission requests.
`resumeSession` already reapplies moi's no-prompt mode after `session/load`;
adding that same load-path fix again would be redundant.

### Capabilities and authentication need separate checks

An executable resolving on PATH proves installation, not authenticated readiness.
`authMethods` advertises login methods, not current login success; an empty list
does not prove unavailability. Run provider status checks under the same
profile/environment as the session and retain an unknown state for custom
agents. No login was performed during this audit.

Check advertised image/resource capabilities. An agent reading a supplied URI
does not prove it consumed embedded content; a strict test needs an inline-only
random marker with no readable file. moi's text-only chunk handler currently
drops unsupported assistant media. Unknown extension requests should receive
prompt errors, but returning an error is not implementing the associated feature.

## 4. Provider-specific solutions

### Hermes

- **Missing live file-tool completions:** reproduced with three starts and one
  update. Preserve an unknown/interrupted outcome when completion is absent;
  never synthesize success at turn end. Upstream should pair completions by
  invocation ID, not FIFO tool name, which also risks out-of-order same-name
  calls. Related background is in [the Hermes notes](../hermes/NOTES.md), whose
  older claims must be read against this audit.
- **Cancellation crash:** a shell cancellation returned `-32603` with
  `'NoneType' object has no attribute 'startswith'`. Source uses
  `result.get('final_response', '')`, which leaves explicit `None` unchanged.
  Normalize optional text upstream and guarantee cancelled finalization.
  Locally preserve cancellation intent, settle cards honestly, and surface
  unexpected errors; do not suppress every exception after a cancel request.
- **Steering works over ACP:** during `sleep 12`, a concurrent prompt containing
  `/steer … reply STEERED …` changed the original run's answer to `STEERED`.
  The slash handler runs before the busy check. A dedicated Hermes steer hook
  must distinguish the short acknowledgement RPC's `end_turn` from completion
  of the original prompt. Its acknowledgement chunks share the session stream.
  `/queue` is advertised but was not freshly exercised; ordinary queueing
  remains the fallback.
- **Model switching drops session MCP configuration:** `_switch_model` rebuilds
  without reattaching it. Keep specs on the session and reattach after rebuild.
  The registry is also process-global by server name; conflicting same-name
  configs are not proven isolated. Use dedicated chat processes when connector
  configs differ. The upstream fix needs instance-scoped MCP ownership.
- **Broken MCP startup can still return a session:** creation success is not
  connector readiness. Preserve connector diagnostics and verify availability
  separately rather than assuming registration is all-or-nothing.
- **Usage is cumulative:** the tools prompt reported 52,132 input / 899 output;
  the next short prompt reported 65,761 / 1,017. `turn_finalizer.py` copies
  `agent.session_*` counters into the response. Compute provider-specific deltas
  only within a known agent instance; reset on rebuild/reconnect and guard
  decreases. An unknown baseline is cumulative data, not invented turn usage.
- **Effort-file workaround is unconnected:** `_make_agent` loads config but
  does not pass resolved `reasoning_config` to `AIAgent`. A mocked constructor
  with `agent.reasoning_effort: high` confirmed the omission. Resolve/pass
  session-local reasoning on creation and rebuild, then expose `thought_level`
  upstream. Keep the independent picker unavailable until that path works.
- **Missing sessions appear to load:** the nonexistent-ID test returned `{}`.
  Upstream should return an explicit error; locally check known membership
  where available without treating a truncated list as authoritative absence.
- **Modes:** warm load preserves `dont_ask`; cold load resets to `default`.
  Reapply the chosen policy on attachment. Historical default-mode file denial
  was bypassed through a shell redirect: that gate is not a filesystem sandbox.
- **Discovery can truncate:** source scans at most 1,000 ACP records before cwd
  filtering. A filtered empty result does not establish that no sessions exist.

### fx

- **One active session per process:** creating another session invalidates the
  first. Source can cancel/reap current work, so serialize neither discovery nor
  unrelated chats through an active chat process. Use one owned lease per open
  chat and a separate short-lived discovery process when needed.
- **Prefer supported history retrieval:**
  `fx session --id <id> --json` returned tool inputs/results and a complete file
  presentation/diff. Adapt that for cold display; attach through
  `session/resume`. `session/load` remains a visibly lossy fallback. This is
  simpler than building readers for private events/checkpoints or introducing
  a generic journal first. [Issue #624](https://github.com/vercel-labs/fx/issues/624)
  was open when checked on 2026-09-05; no new issue was filed.
- **Normalize shell deltas locally:** accumulate incremental `in_progress`
  text into a snapshot; recognize the final shell envelope and retain useful
  `command_result` metadata. File writes can finish with ordinary prose and
  failures with error text, so completion content is not universally metadata.
- **Use tool identity separately from display:** generic titles such as
  `Running` and `Writing` need `name`, `kind`, and `rawInput` for useful labels.
  File paths may be in `rawInput.path` without `locations`; some tools wrap
  inputs in `rawInput.request`. Preserve the native title where useful instead
  of introducing a large vocabulary table upfront.
- **Operational notices arrive as assistant chunks:** classify a buffered
  prefix such as `[context]` or `skill discovery warning:` within the fx hook.
  The prefix can span chunks; IDs rotate when switching between operational
  and assistant output, so do not assume one diagnostic ID per run. Show
  omitted-instruction notices instead of silently hiding missing context.
- **Reapply explicit policy:** setting `code` then loading resets the reported
  mode to `ask`, both warm and cold. Source/historical evidence distinguishes
  reported mode from effective permission settings. Verify policy behavior,
  not just a response label.
- **Validate model selections:** the configured gateway accepted an invalid
  model value; other providers have different validation paths. Prefer its
  known `model` option ID and preserve the separate provider selector. Verify
  returned state and fail the send when a required switch fails.
- **Do not swap global settings for effort:** separate processes still race
  on `~/.fx/settings.json`, crashes can leave a temporary value installed, and
  unrelated CLI launches can observe it. Expose a validated session-local
  `thought_level` option upstream and persist effort with the session.
- **Keep measured run durations:** all four observed CLI tool results had the
  same `created_at_ms`; the turn had no start/end fields. Those timestamps do
  not establish per-tool duration and do not replace `run-durations.ts`.
- **Instruction discovery outside home is limited:** source has a specific
  omission reason for such workspaces. This does not prohibit execution there.
  Report omitted rules; do not move the workspace or spoof `HOME`.

Representative shell updates, abbreviated from the captures:

```json
{"sessionUpdate":"tool_call","toolCallId":"…","name":"shell","title":"Running","kind":"execute","rawInput":{"action":"run","command":"echo hello"}}
{"sessionUpdate":"tool_call_update","toolCallId":"…","status":"in_progress","content":[{"type":"content","content":{"type":"text","text":"hello\n"}}]}
{"sessionUpdate":"tool_call_update","toolCallId":"…","status":"completed","content":[{"type":"content","content":{"type":"text","text":"{\"state\":\"completed\",\"exit_code\":0}"}}],"command_result":{"kind":"command","exit_code":0}}
```

Historical captures/source also describe yielded shell calls whose invocation
finishes while their process remains running, followed by late output. Preserve
that distinction: a completed tool invocation does not prove the underlying
background command exited. Test this path before implementing late-output rules.

### Cursor

- **Use `session/load` for attachment and structured replay.** The tested
  build does not implement `session/resume`. A newly created empty session
  cannot be reloaded before its first prompt, so keep its live lease; do not
  assume a discovery-created ID is already durable history.
- **Keep exact catalog IDs opaque.** Parameterized variants are accepted;
  invented brackets, bare IDs, and unknown config options were rejected.
  Present the available variants without synthesizing combinations. No
  separate per-chat effort override was established by this audit.
- **Preserve delayed tool fields:** inputs, `rawOutput`, diffs, and locations
  can arrive after the start. Tool IDs can include newlines; replay IDs differ.
- **Keep the existing permission callback policy.** Shell approval was freshly
  observed; successful MCP calls and `--force` have historical evidence.
  The callback already supports moi's current auto-approval behavior; requiring
  a global flag is unnecessary.
- **Plan mode needs an implementation:** historical captures show a
  `cursor/create_plan` request. Returning an unsupported-method error prevents
  a hang but does not make plan mode usable. Implement and test the extension
  before exposing the mode. Changed `plan` mode persisted across warm and
  cold loads, contradicting the original universal-reset claim.
- **Report usage unavailable:** no usage was observed in fresh prompts,
  replay, or cancellation. Do not display zero or infer token counts. Consume
  standard fields if a later version emits them.
- **The store is not encrypted as claimed:** the audit session's `store.db`
  contained 14 parseable JSON blobs plus 37 other blobs; 13 contained the test
  marker in plaintext. Binary records do not prove encryption. This does not
  establish a supported schema or complete child-history recovery; prefer load.
- **Treat connector startup separately:** broken stdio MCP creation still
  returned a session ID, as with Hermes.

## 5. Existing moi defects and acceptance criteria

The independent host probe reproduced twelve failed checks, grouped below into
nine related problems. These are host defects, independent of the provider
observations above. The grouped collection row covers three checks; the
loading/readiness row covers two.

| Priority                   | Observed problem                                                       | Required behavior                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| P1                         | Concurrent cold loads issue two load RPCs and competing subscriptions. | Share one initialization promise per session; both callers receive the same complete replay from one RPC.                    |
| P1                         | Loading records appear live; sends can run before replay finishes.     | Separate loading from ready. Register the receiver early, publish readiness late, and make reads/sends await initialization. |
| P1                         | A queued send changes the model during the preceding prompt.           | Keep model/stream settings on the queue item and apply them at dequeue, preserving the original run's metadata.              |
| P1                         | Cancellation/error cleanup marks unfinished tools successful.          | Only completion evidence yields success; use interrupted/unknown or an explicit error explanation for unresolved calls.      |
| P1 before adding providers | Different provider specs in the same cwd reuse one client.             | Key by provider/profile/config generation and session scope; retain the concrete client lease on the session.                |
| P2                         | Adjacent message IDs collapse into one message.                        | Respect identity changes, interleaved tools, and chunked diagnostics.                                                        |
| P2                         | Empty content/locations do not clear; raw output is lost.              | Preserve omitted fields, replace explicit collections including `[]`, and retain output data.                                |
| P2                         | A tool-only prompt loses its response usage.                           | Attach completion metadata to the final assistant/tool turn or a dedicated run record, even without final assistant text.    |
| P2                         | RPC errors lose `code` and `data`.                                     | Preserve typed errors so `-32601` can drive capability fallback and nested provider details remain visible.                  |

Additional source-confirmed gaps, not separately exercised by that mock:

- `resumeSession` ignores returned model/config state. Seed it on attachment
  so replay metadata is correct and the next send does not needlessly rebuild
  an already selected Hermes model. Failed model switches are currently logged
  and ignored; retain the last confirmed selection and surface failure.
- There is **no ACP idle TTL**. `forgetAcpSession` drops the record/subscription
  without cancelling work or releasing the backend session. Add ownership,
  bounded idle cleanup, and cancel/close/release; never reap busy sessions.
- Exit cleanup compares the pool's `startClient(...)` promise with a different
  inner `Promise.resolve(record)`, so identity cannot match. Compare the actual
  stored promise/record and prevent stale exits from deleting replacement
  clients. Validate parsed envelopes against null/primitives and settle
  read/write failures without leaving child processes behind.
- After `__exit`, the old run's `finally` can drain queued work through a new
  process before reattaching the session. Invalidate the client generation and
  explicitly recover or discard queued work. Archive/forget must invalidate
  its runner too.
- Model discovery creates a real session on the shared process. This would
  invalidate fx's active chat even if normal sends used separate keys. Reuse
  ready-session config or acquire a separate discovery lease.
- Listing stops after five pages; preview reads one page and trusts cwd
  filtering. Expose paging, deduplicate IDs/cursors, filter mismatched cwds,
  and report truncation. A generated title is not the first user message.

## 6. Persistence and optional features

Keep transcript retrieval separate from backend attachment. A journal can
restore display but cannot make an agent without load/resume remember previous
context. Never silently replace a failed resume with a new empty conversation.
See [session setup](https://agentclientprotocol.com/protocol/v1/session-setup).

Use Hermes/Cursor load and fx's supported history CLI first. If a journal is
still needed, define versioned records, run IDs, sequence numbers, begin/end
markers, and coverage/freshness before making it authoritative. “Journal if
present” hides external CLI/editor changes and partial recordings. Appending
every accumulated UI snapshot can produce quadratic storage. Define imported
sessions, crash recovery, reconciliation, attachment lifetime, and unavailable
model context explicitly.

Historical subagent traces support flat tool cards as the initial presentation.
Hermes task logs and fx child stores may provide optional enrichment later.
Claims that thoughts are never persisted, child data is only available after
completion, or Cursor has no readable child data exceed the evidence. Do not
couple the first integration to private subagent formats.

moi-side archive is distinct from deleting provider history and must still
cancel/release owned resources. Historical missing close/fork/delete methods
are observations, not universal protocol prohibitions; detect supported methods
and preserve error codes for fallback.

## 7. Implementation order

1. **Fix lifecycle ownership and add regressions.** One pending/ready session
   record, one client lease, one serialized queue, confirmed session config,
   preserved RPC errors, explicit cancellation/release, and guarded recovery.
   Cover the twelve reproduced behaviors before enabling more providers.
2. **Correct the shared adapter.** Replacement collections, message boundaries,
   structured output/diffs, honest final status, and tool-only completion data.
   Keep fx delta/envelope/diagnostic handling in a small provider hook.
3. **Add fx.** Dedicated chat processes, separate discovery, known selectors,
   supported CLI history adapter, and `session/resume`; make fallback loss clear.
4. **Add Cursor.** Reuse config/replay and the current permission callback.
   Show usage as unavailable; implement/test plan requests before enabling plan.
5. **Add user-defined agents only when that product surface is wanted.** Grow
   the existing `AcpProviderConfig` with focused hooks first. A new workspace
   type, migration, custom registry, presentation endpoint, and setup UI are
   separate product work. Custom commands are machine-local; a shareable
   workspace reference must handle a missing local definition explicitly.
6. **Add a journal/private reader only for a demonstrated remaining gap.**
   Define coverage, freshness, recovery, and backend-context behavior first.

## 8. Tracker

Original IDs are retained so earlier references remain meaningful. “Confirmed”
means observed or source-confirmed as specified above, not fixed. The only
linked existing upstream issue is #1; no new reports were sent in this audit.

| #   | Agent  | Finding and disposition                                                                                                                        |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | fx     | Lossy load confirmed. [Issue #624](https://github.com/vercel-labs/fx/issues/624) open as of 2026-09-05; use supported CLI history plus resume. |
| 2   | fx     | Diagnostics confirmed. Buffer/classify within fx and surface relevant notices; upstream should use a distinct notification.                    |
| 3   | fx     | One active session confirmed. Dedicated chat leases, separate discovery, explicit cleanup.                                                     |
| 4   | fx     | Mode reset confirmed; effective policy is distinct from its label. Apply/test explicit policy.                                                 |
| 5   | fx     | Generic titles confirmed. Use name/kind/inputs for identity and display.                                                                       |
| 6   | fx     | Invalid model accepted on the tested gateway. Validate picker values and confirmed state; do not generalize to every backend.                  |
| 7   | Hermes | Missing file-tool completions confirmed. Honest unresolved outcomes locally; invocation-ID pairing upstream.                                   |
| 8   | Hermes | Model rebuild omits MCP config in source. Retain/reattach specs and isolate conflicting registries.                                            |
| 9   | Cursor | Shell approvals confirmed; MCP/force historical. Existing permission callback supports current moi policy.                                     |
| 10  | Cursor | Usage absent in tested paths. Display unavailable and accept future standard updates.                                                          |
| 11  | All    | Universal mode reset disproved. Cursor preserves plan; Hermes preserves warm mode; moi already reapplies mode after load.                      |
| 12  | fx     | Effort option inert. No global settings swap; upstream session-local option and persistence.                                                   |
| 13  | Hermes | Effort config not passed through constructor path. Resolve/pass session reasoning upstream; keep picker unavailable meanwhile.                 |
| 14  | Cursor | Exact catalog variants work; separate effort override not established. Do not invent IDs or claim impossibility.                               |
| 15  | All    | Flat subagent cards have historical evidence. Optional private-history enrichment remains separate work.                                       |
| 16  | Hermes | Newly found cancellation finalizer crash. Normalize optional response text upstream; preserve stop intent and errors locally.                  |
| 17  | Hermes | Newly found cumulative prompt usage. Delta only within a known agent instance and preserve unknown baselines.                                  |
| 18  | Hermes | Newly found nonexistent load returns `{}`. Explicit error upstream; cautious membership checks locally.                                        |
| 19  | Cursor | Newly found empty session cannot cold-load before its first prompt. Retain live ownership.                                                     |
| 20  | moi    | Twelve failed host checks plus source-confirmed lifecycle gaps. Fix and regress before adding providers (§5–7).                                |

## 9. Sources and remaining uncertainty

Primary sources: the installed ACP 1.3.0 schema, installed Hermes source, and
fx's pinned [request handling](https://github.com/vercel-labs/fx/blob/7e02f32f7fca/src/acp/server.zig),
[session handling](https://github.com/vercel-labs/fx/blob/7e02f32f7fca/src/acp/sessions.zig),
[streaming](https://github.com/vercel-labs/fx/blob/7e02f32f7fca/src/acp/prompt.zig),
and [configuration](https://github.com/vercel-labs/fx/blob/7e02f32f7fca/src/core/config/config_runtime.zig).

Cursor's exact old-version replay-fix date, separation of interactive and ACP
stores, every possible effort override, and the original Grok CLI exclusion
were not independently established. Do not carry them forward as requirements.
Catalog counts and timings vary; measure startup, first model token, and tool
completion separately with repeated controlled runs. Diagnostic first bytes
are not model latency.

At audit time, all 42 existing ACP tests passed. Full typechecking was blocked
by the existing `ui-components/drawer.tsx` import of an unexported `Drawer`.
The temporary probes passed lint and produced no type errors. Their twelve
failed host checks remain unresolved; the test suite was not modified to accept
those behaviors.
