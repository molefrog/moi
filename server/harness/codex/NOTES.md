# Codex harness

moi drives chats through `codex app-server`, a persistent process speaking
newline-delimited JSON-RPC over stdio. It provides native model and session
lists, token deltas, steering, and interruption. Codex owns durable history;
moi holds a display copy and translates native items into shared chat events.

## Module ownership

| Module                                 | Responsibility                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                             | Implements the shared `Harness` contract.                                                                              |
| `transport.ts`                         | Frames stdio, routes RPC replies and server requests, times out requests, and closes waiters on disconnect.            |
| `client.ts`                            | Owns one app-server per workspace, initialization, catalogs, session/history queries, and bounded child-history reads. |
| `session.ts`                           | Owns live session state, sends, steering, stop, replay hydration, previews, and notices.                               |
| `adapter.ts`                           | Defines the consumed wire types and maps models, items, and history to display types.                                  |
| `input-requests.ts`, `permissions.ts`  | Handle native questions and the default approval policy, respectively.                                                 |
| `auth.ts`, `discovery.ts`, `status.ts` | Check login readiness, discover workspace paths from rollout heads, and report running processes.                      |
| `session-title.ts`                     | Generates a title with a separate ephemeral `codex exec` call and applies it if the session is still unnamed.          |
| `probe.ts`                             | Runs standalone protocol diagnostics without moi's session or workspace policy.                                        |

The shared contract and event layers are in [../README.md](../README.md).
Dated test evidence belongs in the [validation record](../../../docs/codex-integration-validation.md).

## Runtime and configuration

`../executable.ts` searches the login-shell PATH followed by the server PATH.
If neither resolves `codex`, it checks the macOS `ChatGPT.app` and `Codex.app`
bundles. A CLI on PATH wins even when the desktop app bundles a newer version.

Each process inherits the server environment plus `resolveWorkspaceEnv()` and
`MOI_AGENT=1`. Workspace environment variables are fixed at spawn, which is
why workspaces have separate app-servers. Environment changes close the affected
process; the next request starts a replacement. Closing a process interrupts
its active runs. Idle display eviction does not stop the workspace process.

Codex resolves its own configuration and credentials, including `CODEX_HOME`
(default `~/.codex`). Installations can share that home while running different
binary versions. `config/read` with the workspace cwd supplies effective model,
effort, and tier defaults; moi does not rewrite the user's Codex config.

Initialization enables `experimentalApi`, reads the version from `userAgent`,
and then sends `initialized`. The availability check rejects parsed versions
below 0.89.0, the harness's basic protocol floor; unknown and development
versions are allowed. This floor does **not** establish support for every
feature or model. Use the running process's catalog and version when diagnosing
model errors.

## Session lifecycle

- A new chat starts under a temporary moi id. `thread/start` supplies the real
  id; `session_renamed` rekeys the chat, saved settings, and builder references.
- Concurrent resumes share one promise. Subscribe before `thread/resume`,
  buffer notifications while loading history, then apply them after the
  snapshot. Otherwise a live update can be overwritten by replay.
- Serialize sends through RPC acknowledgement, not through model completion.
  Follow-ups use `turn/steer` with `expectedTurnId` while a turn is active.
  Only an explicit no-active-turn RPC error permits fallback to `turn/start`.
  A timeout or ambiguous failure must not resubmit potentially accepted input.
- Native lifecycle notifications determine activity. Completion can arrive
  before the start acknowledgement; completed ids prevent late responses from
  reviving a run. Ignore stale usage and completion from older turns.
- `error.willRetry` keeps the turn active and emits a retry notice. Failed
  steer/interrupt RPCs keep a known active turn stoppable. A terminal error or
  disconnect clears previews, settles unfinished tool cards, and cancels input.
- Stop invalidates queued sends and interrupts a start acknowledged after Stop.
  For a running turn, wait for native completion before reporting it stopped.
- Idle display records expire after 30 minutes, except during pending input,
  hydration, or title generation. Cold access resumes and subscribes again;
  `thread/read` provides a static fallback when live resume fails.

`thread/list` uses cwd filtering, `updated_at` ordering, and every cursor page.
Repeated cursors fail instead of looping. Child-history loading is limited to
four concurrent reads. Home-card previews reuse an existing app-server and read
up to 50 recent sessions; rendering the home page does not spawn one per card.
Workspace import discovery separately reads up to 400 recent rollout heads
under the server's `$CODEX_HOME/sessions`, without requiring a CLI executable.

## Models, effort, and fast mode

`model/list` is the source of picker capabilities. The catalog is paginated,
filters hidden rows, and is cached per client for one minute. Login/account
notifications invalidate it; replacing the process also replaces its cache.
Effective config is read separately. Never share catalogs across workspace
processes, whose environment can select different accounts or providers.

The synthetic `default` row resolves to the configured model when listed,
otherwise the catalog default, otherwise the first available model. The picker
and send path share `resolveSelectedModel`; when the catalog is available, a
Codex UI send includes that concrete native model. Omitting it can inherit an
unavailable config or resumed-thread model while the picker shows a fallback.
Changing a selection does not retry an earlier failed message.

Configured reasoning effort applies when supported by the selected model;
otherwise the adapter uses its advertised default. Fast mode is available when
`serviceTiers` includes `priority`, or the legacy `additionalSpeedTiers` includes
`fast`. A non-null configured tier takes precedence over the catalog default.

| moi fast-mode setting | Native `serviceTier`                     |
| --------------------- | ---------------------------------------- |
| On                    | `"priority"`                             |
| Off                   | `null`                                   |
| Unset                 | Omitted; inherits the config/thread tier |

Model, effort, and tier changes apply on the next **new turn**. `turn/steer`
has no fields for changing them during an active turn. moi uses the persistent
`serviceTier` override for chat settings; it does not use the newer
`serviceTierForTurn` override, which affects only one turn.

## Context, permissions, and questions

`additionalContext` carries the application context under `moi-context`, and
localhost access guidance under `moi-control-access`. Values use the unwrapped
body because Codex supplies the tags; native context is not echoed as a user
item. `client.ts` gates this channel at 0.135.0. Older or unrecognized versions
receive a text envelope, which the adapter strips from echoes and previews.
The version gate matters because older servers can silently ignore the field.

`permissions.ts` selects workspace-write access and `approvalPolicy: 'on-request'`
on start/resume. New turns explicitly set the workspace-write sandbox with
network access disabled. moi automatically accepts supported permission
requests; there is no command-approval UI.
Command/file requests use `decision: 'accept'`, legacy requests use `approved`,
and permission extensions grant the requested network/file-system fields for
`scope: 'turn'`. Unknown request methods receive an unsupported-method error.

`item/tool/requestUserInput` is handled asynchronously by the owning session.
Start/resume opts into `features.default_mode_request_user_input` for moi's
threads. Questions render in chat; answers go through the workspace/session
input endpoint. Blocking questions set activity to `requires-action`.

Pending forms survive browser reload while the app-server and moi session
remain alive. Skip, stop, completion, disconnect, or `serverRequest/resolved`
settles the request. Random notice ids keep stale forms from answering a new
request when native request ids are reused. Submitted response payloads are
redacted from the wire tap and excluded from input notices; this does not
redact answers that Codex later includes in its own messages or history.
MCP schema/URL elicitation is separate and currently declined.

## Display and MCP boundaries

- Native items become display turns or notices. `clientUserMessageId` is echoed
  as `clientId` on live user items, so the optimistic bubble is updated in place.
  Replay can change item ids and omit `clientId`; they are not durable moi ids.
- Agent text and reasoning-summary deltas become cumulative previews, batched
  every 40ms. Item completion removes its pending preview. Command output is
  rendered from item payloads; output-delta notifications are not forwarded.
- New turns request `summary: 'detailed'`. Reasoning can still be absent for a
  trivial prompt. Replay uses native timestamps and duration when supplied,
  rather than deriving duration from items sharing a turn timestamp.
- Child transcripts nest under `subAgentActivity` cards. Replay excludes
  inherited parent turns and child send-back activity; missing children leave
  their cards visible. Generated images are represented by tool cards without
  embedding the potentially large base64 result in every display event.
- Uploads send images inline as data URLs and other files as materialized path
  notes. Replayed `localImage` items currently show a path label.
- Hooks and failed MCP startup events appear as notices. The connector list
  maps `notLoggedIn` to `needs-auth` and other listed servers to `connected`;
  that label is an auth-status approximation, not a health check. Full tool
  definitions are not carried into connector display rows. `codex_apps` branding
  uses the dotted tool-name prefix; connector `_meta` is not forwarded.

## Diagnostics and maintenance

1. Inspect `/status` for the selected executable, process ids, and active turns.
   Use `/dev/harness` or `GET /api/workspaces/:id/harness/debug` for the native
   wire and display frames. `initialize.userAgent` identifies the running
   version; `codex --version` only identifies what a new terminal process runs.
2. For a picker mismatch, compare `model/list`, `config/read`, and the outgoing
   `turn/start` model/effort/tier. For a run that stays busy, inspect lifecycle
   frames and pending native input before assuming it is still generating.
3. Update the selected standalone CLI with `codex update` when it supports that
   command. Already-running app-servers keep the old executable until restarted;
   let active chats finish before restarting them or the moi dev server.

Read-only standalone probes (run from the repo root):

```sh
bun server/harness/codex/probe.ts models
bun server/harness/codex/probe.ts threads "$PWD"
bun server/harness/codex/probe.ts rpc "$PWD" config/read '{}'
```

The probe uses the invoking shell's PATH/environment, disables experimental
fields, and logs raw frames. Use the running moi wire tap to verify workspace
policy, native questions, or actual UI behavior.

Wire types are a hand-written subset, read defensively. Generate reference
bindings into a temporary directory when changing the integration:

```sh
codex app-server generate-ts --experimental --out /tmp/moi-codex-protocol
```

Compare the relevant `ServerRequest`, `ServerNotification`, and `v2` types;
do not generate bindings during builds or require an installed CLI in CI.
Tests are colocated; run `bun test server/harness/codex` for the harness suite.
Protocol presence alone is not UI support: review/fork controls, account usage
limits, direct MCP operations, and general structured chat output are not
exposed by this harness.
