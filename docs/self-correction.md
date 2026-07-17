# Self-correction

**Key idea:** the agent that builds applets should also be able to _tell when they're broken_
— without waiting for the user to complain. Today the feedback loop ends at `moi bundle`: a
widget can compile fine, then fail to load in the browser, crash on render, or call a server
function that throws — and the agent learns none of it.

Self-correction closes the loop with two legs:

| leg      | command              | what it answers                                     |
| -------- | -------------------- | --------------------------------------------------- |
| **feel** | `moi debug logs`     | "did anything break at runtime since I last built?" |
| **poke** | `moi call-server-fn` | "does this server function actually work?"          |

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
   preventable up front with **call-server-fn**.
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
  `window` events to `POST /api/workspaces/:id/applet-log` — fire-and-forget, throttled,
  size-capped. Reporting is **always on**: when the user says "it's broken", the crash their
  tab saw five minutes ago is already on record.
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

`moi call-server-fn` invocations deliberately do **not** record — a failing smoke test is
feedback the agent already has in hand.

## `moi call-server-fn` — poke a server function

Invoke one exported `.server.ts` function directly. Server functions only — this is not a
general script runner (that's `moi env exec`).

```
moi call-server-fn widgets/hello/getGreeting              # no arguments
moi call-server-fn views/crm/searchUsers '["ann", 10]'    # args as one JSON array
```

- **Ephemeral, isolated execution.** Each invocation spawns a **fresh one-shot worker
  process**, runs the single call, and kills the process. A debug invocation therefore never
  touches the warm worker pool the widgets use: no shared module-level state in either
  direction, and a call that wedges its process takes the throwaway worker down with it, not
  the pool. Everything else — env resolution (`.env` + custom secrets, widgets sink), module
  loading, the 30s timeout, the devalue wire format — is identical to the browser RPC path,
  so a pass here means the production machinery works. (The one deliberate difference from a
  warm-pool call: module-level state starts clean, e.g. a fresh DB connection.)
- The module key is the same path-relative key the RPC uses (`widgets/hello`, `views/crm`,
  `lib/db`), plus the function name: `<module>/<fn>` — split on the last slash.
- Arguments are a **plain JSON array** (friendlier to write than devalue's wire format); the
  server converts to the devalue encoding the worker expects. JSON-expressible values only —
  enough for smoke tests.
- Prints the returned value (inspected, so `Map`/`Set`/`Date` render readably) and the call
  duration; a thrown error prints the message and exits 1.
- Duration matters: the RPC timeout is 30s, so a smoke test that takes 8s is a warning sign
  the agent can act on. (Expect a few hundred ms of process-spawn overhead on top of the
  function's own time — the isolation costs a fork.)

## The loop, as the skill teaches it

1. **Build** — `moi bundle`; a `failed` row is fixed before anything else. The footer nudges
   when older runtime errors are still on record.
2. **Poke** — new or changed `.server.ts` functions get a `moi call-server-fn` smoke test
   before the agent reports them working.
3. **Feel** — `moi debug logs` when the user reports breakage, and proactively after shipping
   something new (once the user's tab has had a moment to load it).

## How it works

- **Control port.** `debug:logs` and `call-server-fn` are control-socket message types next
  to `bundle`/`theme`/`scratch`, workspace-resolved the same way (subdir-safe, loud errors
  outside a registered workspace).
- **Journal.** `server/applet-log.ts` owns the ring buffer; producers call `record` from the
  RPC route, the bundle pipeline, and the `POST /applet-log` route. The client reporter is a
  tiny fire-and-forget module wired into `useApplet`, `WidgetErrorBoundary`, and a global
  `error`/`unhandledrejection` hook that attributes by bundle-URL stack match — unattributed
  page errors are never recorded (the host app's bugs are not the applet journal's business).
- **Ephemeral worker.** `callFunctionEphemeral` (server/functions.ts) shares the spawn and
  per-call IPC mechanics with the warm pool but skips the LRU cache: spawn → ready → one call
  → kill, with the same env injection and cwd contract.
- **Validation.** The POST route accepts only the browser-side sources
  (`load`/`render`/`window`), whitelists `kind`, pattern-checks `name`, caps message/stack
  lengths and events per request — it's an unauthenticated localhost route and is treated
  with the same suspicion as `/fs/`.

## Constraints & non-goals

- **The journal is not observability.** No persistence, no levels, no tracing — it answers
  exactly one question: "what's broken right now that I'd otherwise not know about?"
- **`moi call-server-fn` args are JSON.** Values that need devalue's richer encoding (`Map`
  args, etc.) can't be expressed — acceptable for smoke tests, revisit if it ever bites.
- **`moi debug` is experimental.** Output format and flags may change; scripts should not
  parse the human output (use `--json`).

## Future ideas

- `moi shot widget|view <name>` — screenshot an applet through a live workspace tab
  (offscreen mount + DOM rasterization) with box-vs-content overflow facts, so the agent can
  _see_ what it built. Prototyped and removed from scope for now.
- Slow-call warnings: record `rpc` entries for calls that succeed but take >5s.
- Console capture: attribute applet `console.error` output the way window errors are.
- More `moi debug` subcommands: worker-pool state, recent RPC traces, env diagnostics.
