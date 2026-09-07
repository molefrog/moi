# Codex integration validation

Checks performed on September 7, 2026. This records what was tested; the
[Codex harness notes](../server/harness/codex/NOTES.md) describe current behavior
and maintenance commands.

## Test environment and scope

Full browser validation used CLI **0.147.0**, moi's development server, and the
Codex in-app browser. The local `codex-integration-check` workspace retained the
main test chat as native thread `01a07c5f-202c-7b01-9e5b-022ce3b66c8d`.

After upgrading the standalone CLI to **0.153.4**, both idle moi app-servers
were restarted. Their initialization responses confirmed 0.153.4 and the
expected Codex home. Live `model/list` metadata agreed with moi's model and
fast-mode capabilities. These upgrade checks did not repeat the full browser
matrix below. Experimental bindings were generated locally for both versions;
the model, turn settings, steering, and input/permission types were checked
again during the documentation audit.

## Automated validation before the documentation audit

- `bun test`: 1,561 passed, four existing skips, zero failures across 170 files.
- Typecheck, lint, production client build, and `git diff --check` passed.

Regression tests cover framing and EOF, failed writes, timeouts, pagination,
permission schemas, input validation and stale answers, session-scoped routing,
concurrent sends/resumes, hydration races, early completion, steering failures,
startup cancellation, retries, disconnect recovery, stale usage, preview batching,
and replay duration. They use simulated transports and require no Codex account.

## Browser and native-wire evidence (0.147.0)

| Flow                        | Observed result                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New chat and shell tool     | Temporary id replaced; command ran and returned `MOI_CODEX_FAST_OK`.                                                                                                   |
| Fast mode                   | Inherited on reported `serviceTier: "priority"`; switching off sent `serviceTier: null`.                                                                               |
| Model and effort            | Selected 5.6 Luna / Low; inherited effort agreed with the picker.                                                                                                      |
| Native question             | Answering Green returned `COLOR=Green`. The pending form remained answerable after reload.                                                                             |
| Skip and narrow layout      | Form fit at 390 × 844; skipping after reload returned `SKIP_OK` and restored idle state.                                                                               |
| Typed answer and reused ids | Question id `constructor` accepted READY and returned `FINAL=READY`. Reusing native request id 0 after reconnect did not revive the old form.                          |
| Image attachment            | Model described the attached Codex icon; attachment remained visible after reload.                                                                                     |
| Steering                    | Follow-up during a shell tool used `turn/steer` and returned `STEERED_DONE`.                                                                                           |
| Stop                        | `turn/interrupt` led to `turn/completed { status: interrupted }` and an idle composer.                                                                                 |
| History reload              | Transcript, selected settings, and native durations survived, including a 20-second turn.                                                                              |
| Disconnect and recovery     | Killing the test app-server cleared activity and showed recovery feedback. The same chat resumed and returned `RECOVERY_OK` without repeating the interrupted command. |

The dev annotation toolbar initially intercepted clicks; closing its feedback
mode restored interaction. A pre-existing Base UI warning remained in the
sidebar feedback link. No Codex chat or question-form runtime error remained
after the input fix.

## Model selection regression (0.147.0)

`config/read` named Astra while that CLI's catalog omitted Astra and defaulted
to Sol. The picker displayed Sol, but the send omitted `model`, so Codex
inherited Astra and failed. The shared picker/send resolver now sends the
concrete catalog model.

With no workspace model override and config still set to Astra, a fresh chat
(`01a07c7a-cc02-7b02-9e5e-5d002929f463`) verified:

- The picker displayed Sol; `thread/start` and `turn/start` both sent
  `gpt-5.6-sol`, returning `DEFAULT_MODEL_OK`.
- Selecting Sol explicitly and sending again returned `SELECTED_SOL_OK`.
- Eight send-path regression cases cover default/stale/explicit choices,
  native ids, capability validation, and catalog loading.

Live validation covers the versions and account above. Simulated compatibility
and failure tests do not establish end-to-end support for every older CLI.

## Documentation audit

The follow-up cleanup changed documentation and comments only. TypeScript output
with comments removed matched the previous revision for all 17 edited source
files. Typecheck, lint, formatting, local documentation links, and whitespace
checks passed. The documented model probe returned seven models from CLI
0.153.4, five advertising Fast mode. The test suite and browser matrix were
not rerun for this cleanup.
