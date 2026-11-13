# Applet checks and runtime errors

Agents can check applet source, rebuild it, call server functions, and inspect
errors reported by the running app. The implementation lives in `server/applets/`;
CLI entry modules live in `server/cli/commands/`.

## Commands

- `moi check` typechecks applet source with Moi's bundled declarations and Bun
  types. `--only` narrows it to a kind or one applet.
- `moi bundle` rebuilds changed widgets and views. `--force` rebuilds even when
  sources appear unchanged; `--only` narrows the selection.
- `moi call-server-fn widgets/example/getGreeting '["Ann"]'` invokes an exported
  `.server.ts` function in a separate one-shot worker and prints its result.
- `moi debug logs` prints current applet errors. `--json` emits structured output,
  `--only` filters applets, and `--clear` clears the journal.

Use each command's `--help` for its arguments. A successful typecheck or build
cannot confirm browser rendering or external service behavior; inspect those
through the app and error journal where relevant.

## Error journal

`server/applets/log.ts` holds an in-memory journal per workspace. Browser module
load failures, render errors, attributed window errors, server-function errors,
and failed builds feed it. Browser reports enter through the workspace
`/applet-log` API route; server-side failures are recorded at their source.

Each workspace keeps up to 100 entries. Repeated errors with the same source,
attribution, and message update their count and timestamp. Messages and stacks
are capped. Restarting the server clears the journal.

A successful rebuild clears errors for the rebuilt applet and its rebuilt
server modules. Entries for removed applets are cleared during build-result
reconciliation. Failed and skipped builds do not clear still-relevant errors.

## Server functions

`functions.ts` manages a bounded pool of workspace worker processes;
`functions-worker.ts` loads `.server.ts` modules and handles calls and reloads.
Browser RPC uses this pool. `call-server-fn` uses a fresh worker for its one-shot
call, so it does not share a warm worker's module state.

Workers start from a neutral directory to avoid Bun automatically loading a
workspace `.env`, then switch to the workspace root. The parent supplies the
resolved workspace environment. Module paths remain relative to `.moi/`.
Changes to server modules cause workers to dispose cached modules and restart.

The relevant tests are `server/test/applet-log.test.ts`,
`server/test/applet-typecheck.test.ts`, `server/test/functions.test.ts`,
`server/test/functions-worker.test.ts`, and `server/test/server-dep-reload.test.ts`.
