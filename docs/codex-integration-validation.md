# Codex integration validation

Validated on September 7, 2026 with `codex-cli 0.147.0`, the local app-server,
and moi's development server in the Codex in-app browser.
The dedicated local workspace is `codex-integration-check`; native Codex
thread `01a07c5f-202c-7b01-9e5b-022ce3b66c8d` retains the test conversation.

## Protocol reference

Generated the current experimental TypeScript protocol using:

```sh
codex app-server generate-ts --experimental --out /tmp/moi-codex-protocol-0147
```

Compared the adapter against `ServerRequest`, `ServerNotification`, model/config
types, thread lifecycle, turn start/steer/interrupt, and native input response
types. See the [official app-server documentation](https://learn.chatgpt.com/docs/app-server)
and [implementation notes](../server/harness/codex/NOTES.md).

## Automated checks

- `bun test`: 1,553 passed, four existing skips, zero failures across 170 files.
- `bun run typecheck`: passed.
- `bun run lint`: passed.
- `bun run build:client`: passed, producing 72 files.
- `git diff --check`: passed.

New regression coverage exercises fragmented UTF-8 and JSON-RPC framing,
trailing EOF responses, write failures, timeouts, duplicate cleanup, pagination,
permission response schemas, input validation and stale answers, session-scoped
HTTP routing, concurrent resumes/sends, notifications during hydration, early
completion, steering errors, cancellation during startup, retryable errors,
disconnect recovery, stale usage/completions, preview batching and replay timing.
Tests use in-memory transports and mock availability probes; they do not need a
Codex account or launch a model.

## Live browser checks

| Flow                                    | Observed result                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New chat and shell tool                 | Native session created, temporary id replaced, command ran, and `MOI_CODEX_FAST_OK` returned.                                                                               |
| Fast mode inherited on                  | Native `thread/start` response reported `serviceTier: "priority"`.                                                                                                          |
| Fast mode explicitly off                | Toggled in the effort picker; subsequent `turn/start` sent `serviceTier: null`.                                                                                             |
| Model and effort                        | Picked 5.6 Luna and Low. Native config exposed inherited effort, which now agrees with the picker.                                                                          |
| Native question                         | Enabled the Default-mode feature, answered Green through the form, and received `COLOR=Green`.                                                                              |
| Pending question reload                 | Reloaded while Codex waited; the form remained answerable without creating another request.                                                                                 |
| Question skip and narrow layout         | At 390 × 844, the form fit the chat column. Skipping after reload returned `SKIP_OK` and restored the idle composer.                                                        |
| Typed answer with a special question id | Native question id `constructor` rendered normally; typing READY returned `FINAL=READY`. Native request id 0 was reused after reconnect without reviving the previous form. |
| Image attachment                        | Uploaded the repository's Codex icon; the model described it, and the image remained visible after reload.                                                                  |
| Steering                                | Sent a follow-up during a shell tool; the wire used `turn/steer`, and the model returned `STEERED_DONE`.                                                                    |
| Stop                                    | Stopped a foreground sleep; the wire showed `turn/interrupt`, then `turn/completed` with `interrupted`, and the composer returned to idle.                                  |
| Completed history reload                | Transcript and selected configuration survived. Native durations remained correct, including the first 20-second turn.                                                      |
| App-server disconnect                   | Terminated only the dedicated test app-server during a running command. The chat displayed a recovery message and cleared its busy state.                                   |

The dev annotation toolbar initially intercepted mouse clicks. Closing its
feedback mode restored normal interaction; the stop check above was confirmed
on the native wire, independently of the button appearance. Browser logs also
contain a pre-existing Base UI warning from the sidebar feedback link; no
question-form or Codex chat runtime error remained after the input fix.

After the deliberate app-server disconnect, a new process resumed the same chat
and returned `RECOVERY_OK` without repeating the interrupted command.

## Remaining boundaries

- Command/file approvals retain moi's existing automatic approval policy. There
  is no new approval UI. Permission-extension replies now match the native
  schema. Unsupported MCP elicitation requests are explicitly declined.
- Pending question forms survive browser reloads while their app-server is
  alive. Process death cancels those requests. A stale form cannot answer a new
  request after reconnect, even if Codex reuses the same native request id.
- moi excludes submitted answers from its notice records and wire debug ring.
  Codex still receives the tool response and controls its own durable history;
  the model can also include an answer in its reply.
- Model, effort, and fast-mode changes apply to the next new turn. The native
  steering RPC cannot change those settings in an already running turn.
- Compatibility and failure paths are covered by simulated protocol tests;
  live UI validation used the installed CLI version and account.
