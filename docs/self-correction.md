# Self-correction

**Key idea:** the agent that builds applets should also be able to _tell when they're broken_
— without waiting for the user to complain. A successful `moi bundle` only proves compilation.
Loading, rendering and backend calls still need runtime feedback.

Self-correction closes the loop with two legs:

| leg      | command                                                    | what it answers                                     |
| -------- | ---------------------------------------------------------- | --------------------------------------------------- |
| **feel** | `moi debug logs`                                           | "did anything break at runtime since I last built?" |
| **poke** | `moi tools view:<id>`; `moi call view:<id> <tool> '{...}'` | "does this view operation work?"                    |

Both ride the existing plumbing: the control port for CLI round-trips and the functions
worker for direct invocation. Nothing new is invented — the loop is wired out of parts that
exist.

## Failure taxonomy

Where an applet can go wrong after `moi bundle` succeeds, and which leg catches it:

1. **Module load failure** — the browser's dynamic `import()` of the bundle rejects (bad
   top-level code, missing default export). Caught by `useApplet`, shown to the user,
   previously invisible to the agent. → **logs** (`load`).
2. **Render crash** — the component throws during render; `WidgetErrorBoundary` catches it
   and `console.error`s into a console nobody reads. → **logs** (`render`).
3. **Async runtime error** — an event handler or effect throws outside React's render path;
   surfaces as a window `error`/`unhandledrejection`. Attributable to an applet by matching
   stack frames against its bundle URL. → **logs** (`window`).
4. **Server-function failure** — `.server.ts` throws (or times out) behind the RPC route; the
   server returns 500 and only the browser sees the message. → **logs** (`rpc`), and
   testable through the applet UI. New backend operations can be checked with **moi call**.
5. **Build failure** — already reported by `moi bundle`, but an old failure is easy to lose
   track of turns later. → **logs** (`build`) keeps it on record until a good build.

## `moi debug` — the workspace debugging toolbox (experimental)

`moi debug` is an **experimental** command group for inspecting a running workspace. It ships
with one subcommand — `logs` — and is expected to grow (worker state, RPC traces, …). Being
experimental means its output format and flags may change between releases; the agent should
treat it as a diagnostic aid, not a stable API.

### `moi debug logs` — the applet error journal

A per-workspace, in-memory ring buffer of applet runtime errors, queryable from the CLI.

```
moi debug logs            # print errors on record (oldest → newest)
moi debug logs --json     # machine-readable, includes stacks + epoch timestamps
moi debug logs --clear    # wipe the buffer
```

- **Entry shape:** `{ ts, source, kind?, name?, module?, fn?, message, stack?, count }` —
  `source` is one of `build | load | render | window | rpc`; `kind`/`name` attribute the
  applet when known; `module`/`fn` pin down the server function for `rpc` entries.
- **Producers.** Server-side: the RPC route records every failed function call; the bundle
  pipeline records build failures. Browser-side: the client POSTs `load`, `render`, and
  `window` events to `POST /api/workspaces/:id/applet-log` — fire-and-forget and
  flood-guarded: a per-error cooldown (5s) collapses repeats of the same error, and a global
  cap (30 reports/min) bounds the total even when the message varies every occurrence, so a
  tight throw loop never becomes a POST-per-frame storm. `window` errors attribute via
  `ErrorEvent.filename` first (structured, no stack parsing), falling back to a bundle-URL
  match in the stack text. Reporting is **always on**: when the user says "it's broken", the
  crash their tab saw five minutes ago is already on record.
- **Dedup.** A repeat of an identical error (same source + attribution + message) bumps a
  `count` and its timestamp instead of appending — a render crash loop is one line, not a
  hundred.
- **Lifecycle.** The buffer holds the _standing_ problems since each applet's last good
  build: a successful rebuild of an applet clears its entries (including `rpc` entries for
  the server modules that were rebuilt with it). The buffer is bounded (100 entries/workspace)
  and in-memory — a server restart starts clean, which is correct: the journal describes the
  current runtime, not history.
- **The nudge.** `moi bundle` output ends with `ℹ N runtime error(s) on record — moi debug
logs` whenever the buffer is non-empty after the rebuild, so the agent is pointed at
  standing breakage exactly when it's paying attention.

## `moi tools` and `moi call` — exercise a view operation

```sh
moi tools view:orders
moi call view:orders archive_order '{"id":"o-1024"}'
moi call view:orders set_filter '{"status":"overdue"}'
```

Discovery is view-scoped and returns descriptors with schemas and execution location.
Arguments are one JSON object, defaulting to `{}`; results are JSON on stdout, duration on stderr,
and errors exit nonzero. The definition selects the execution location; a failed operation is
never retried elsewhere.

Server tools use the same warm worker, validation, workspace environment and backend state as
browser calls. They work without an open browser. Calls perform real operations and can change
data; choose a read or an appropriate test input when investigating.

UI tools operate on live React state. They require one connected browser with the view active.
Switching tabs makes them unavailable. Multiple clients with the same view active make UI calls
ambiguous.

Tool-call errors are returned directly to the caller. They do not automatically create journal
entries; an unhandled browser error can still be reported by the normal window error reporter.

## How the skill presents it

The moi-workspace skill describes both commands as **available feedback channels, not a
mandatory checklist** — the agent decides when a smoke test or a journal check is worth the
trip (typically: after building something non-trivial, or when the user reports breakage).
The ambient signals do the nagging instead: the `moi bundle` footer calls out standing
errors, and the journal is already populated by the time the user complains — reporting is
always on, opting in is only about _reading_ it.

## How it works

- **Control port.** `debug:logs`, `tools` and `call` are control-socket message types next
  to `bundle`/`theme`/`scratch`, workspace-resolved the same way (subdir-safe, loud errors
  outside a registered workspace).
- **Journal.** `server/applet-log.ts` owns the ring buffer; producers call `record` from the
  RPC route, the bundle pipeline, and the `POST /applet-log` route. The client reporter is a
  tiny fire-and-forget module wired into `useApplet`, `WidgetErrorBoundary`, and a global
  `error`/`unhandledrejection` hook that attributes by bundle-URL stack match — unattributed
  page errors are never recorded (the host app's bugs are not the applet journal's business).
- **Server worker.** `server/functions.ts` owns the warm worker pool shared by legacy RPC
  and server tools. `server/tools.ts` resolves tool names; `server/view-tool-relay.ts` routes
  UI calls to one browser. The CLI uses the control socket; browser imports use the JSON tool
  routes in `server/api.ts`.
- **Validation.** The POST route accepts only the browser-side sources
  (`load`/`render`/`window`), whitelists `kind`, pattern-checks `name`, caps message/stack
  lengths and events per request — it's an unauthenticated localhost route and is treated
  with the same suspicion as `/fs/`.

## Constraints & non-goals

- **The journal is not observability.** No persistence, no levels, no tracing — it answers
  exactly one question: "what's broken right now that I'd otherwise not know about?"
- **Tools use JSON.** Descriptions and schemas are explicit. Dates must be converted to strings
  and rich collections to JSON objects or arrays at the tool boundary.
- **`moi debug` is experimental.** Output format and flags may change; scripts should not
  parse the human output (use `--json`).

## Future ideas

- `moi shot widget|view <name>` — screenshot an applet through a live workspace tab
  (offscreen mount + DOM rasterization) with box-vs-content overflow facts, so the agent can
  _see_ what it built. Prototyped and removed from scope for now.
- Slow-call warnings: record `rpc` entries for calls that succeed but take >5s.
- Console capture: attribute applet `console.error` output the way window errors are.
- More `moi debug` subcommands: worker-pool state, recent RPC traces, env diagnostics.

## Existing applets and migration

New view backend operations are entries in `views/<id>.server.ts`'s `tools` export. Helpers
are private functions or imports from ordinary backend modules. React imports `tools` from the
server module and awaits `tools.<name>.execute(args)`; the bundler emits request proxies.

Existing named async function imports still compile to the same positional, devalue RPC calls.
Already-built bundles keep their `/rpc/<module>/<fn>` endpoint and rich argument/result behavior.
The old `call-server-fn` CLI, control handler and throwaway worker path have been removed;
browser compatibility uses the warm worker independently.

Migrate views individually. Add explicit tools around shared helpers, switch current callers,
and retain thin legacy exports while old bundles may remain open. Keep the wrappers' names,
arguments and results intact, even if a new tool uses different JSON shapes. Do not automatically
expose legacy functions as tools or infer schemas. Widget function imports remain supported.

Native WebMCP is optional for CLI calls. In supporting browsers, moi publishes the view's UI tools
and server request wrappers from the same descriptors. See the workspace skill's Tools section.
