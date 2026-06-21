# Bug: `moi bundle` silently no-ops from the wrong directory

**Status:** fixed 2026-06-21 · diagnosed 2026-06-19 (from the Faroe Lightroom workspace thread)
**Severity:** high — agents/users "build" repeatedly while nothing rebuilds, and it
scaffolds a junk nested `.moi/.moi/` directory.

## Symptoms

Editing a view/widget source (`.moi/views/<name>.tsx`) and running `moi bundle`
produced **an empty result table and exit 0** — but nothing rebuilt and the UI never
updated. It only worked once run from the workspace **root**, not from inside `.moi/`.
Along the way it created `…/<workspace>/.moi/.moi/.build/` (still present in
faroe-lightroom).

Observed in session `398103a4` of `/Users/molefrog/git/faroe-lightroom` — ~6 `moi bundle`
invocations from inside `.moi/`, all empty, before the agent discovered it must run from
the workspace root.

## Root cause

`moi bundle [DIR]` defaults `DIR` to `.` and sends `path = resolve(args.dir)` (the CWD)
to the server (`server/cli.ts`). The control handler used that path **directly as
the workspace root, with no validation** (`server/control.ts`, bundle branch:
`workspacePath = String(data.path ?? workspaces[0].path)`), and `getAppletPaths` blindly
joins `.moi` onto it (`server/applets.ts`):

```ts
const moiRoot = join(workspacePath, '.moi') // <path>/.moi
const sourceDir = join(moiRoot, 'views') // <path>/.moi/views
const buildDir = join(moiRoot, '.build', 'views') // <path>/.moi/.build/views
```

Run from inside `.moi/`, `workspacePath = <ws>/.moi`, so it targeted the **phantom nested**
`<ws>/.moi/.moi/views` (no sources) and `<ws>/.moi/.moi/.build/views`.

The failure chain:

1. **Silent false success** — no sources → empty table, **exit 0**. Looked like it worked.
2. **Junk scaffold** — `buildApplets` ran `mkdir(buildDir, {recursive:true})`
   _unconditionally_, creating the nested `.moi/.moi/.build/`.
3. The real build (`<ws>/.moi/.build/views/<name>`) was never touched → stayed stale; the
   open view kept showing the old bundle.

Inconsistency: the sibling `moi scratch` control handler _did_ validate the path
(`workspaces.find(w => w.path === path)` → errors `No workspace registered at ${path}`).
`bundle` skipped that check.

## Fix (implemented)

1. **Resolve to the real workspace root.** `findWorkspaceForPath` (`server/registry.ts`)
   maps the requested path to the registered workspace that contains it — itself or its
   nearest registered ancestor (longest matching prefix, git-style). The bundle control
   handler (`server/control.ts`) uses it, so `moi bundle` works from `.moi/` or any
   subdirectory, and **fails loudly** when the path is nowhere near a registered
   workspace:

   ```
   Error: /tmp is not inside a registered moi workspace. Open it in moi, or run from the workspace root.
   ```

   The handler now replies with `{ ok, workspacePath, results }` (or `{ error }`); the CLI
   prints the error and exits non-zero instead of silently swallowing a non-array reply.

2. **Don't fake success / don't scaffold junk.** `buildApplets` (`server/applets.ts`)
   only `mkdir`s the build dir when ≥1 source exists (it still prunes an existing one when
   every source was deleted). The per-kind manifest write (`server/widgets.ts`,
   `server/views.ts`) is gated on the build dir existing — so a workspace with **no**
   widgets/views is a true on-disk no-op. The CLI reports it plainly:

   ```
   moi bundle — nothing to build

     No widgets or views found in <ws>/.moi/
   ```

3. **Generalized to every workspace-scoped command.** `theme`, `config`, and `scratch`
   shared the same unvalidated-path footgun (run from `.moi/`, `moi theme`/`moi config`
   would write `<ws>/.moi/.moi/.workspace.json`; `scratch` errored). They now all route
   through one `resolveWorkspace` helper (`server/control.ts`) built on
   `findWorkspaceForPath`, so each lifts to the real root from any subdirectory and errors
   consistently when outside a workspace.

4. **`moi init` lifts to the workspace root and never nests.** Running `moi init` from
   inside a `.moi/` (the reported cause of `.moi/.moi`) now lifts to the directory that
   owns it via `liftToWorkspaceRoot` (`server/registry.ts`, pure — cuts at the _first_
   `.moi` segment, so even an already-nested `.moi/.moi/…` resolves to the true root) and
   prints what it did. `scaffoldMoiDir` (`server/moi-scaffold.ts`) additionally **refuses**
   to scaffold a `.moi/` inside another `.moi/` as a backstop. `moi init` also flags a
   pre-existing stray `.moi/.moi` with a one-line `rm -rf` to clean it up.

5. **Tests** cover the resolution (`server/registry.test.ts` → `findWorkspaceForPath` and
   `liftToWorkspaceRoot`), the no-scaffold/prune behavior (`server/test/applets.test.ts`),
   and the scaffold backstop (`server/test/moi-scaffold.test.ts`).

Verified end-to-end against a scratch workspace: bundle from the root, from inside
`.moi/`, and from a deep subdirectory all target the real root (no `.moi/.moi`);
staleness, `--force`, `--only`, prune-on-delete, the unrelated-dir error, and the empty
workspace all behave as above.

## CLI output: plain tabular mode

`moi bundle` (and `moi theme`, `moi openclaw`) rendered with `cli-table3`, which colors
its borders/headers **unconditionally** — even into a pipe. An agent capturing
`moi bundle 2>&1` got literal `[90m`/`[31m` escape noise instead of a table. These now use
a borderless, alignment-only renderer (`server/cli-ui.ts`: `columns`, `keyValue`) that
looks the same on a TTY or a pipe, matching the `moi config` style. Colors are applied
only via picocolors (which no-ops off-TTY, so they never reach the agent). `cli-table3`
was dropped from `package.json`.

## Cleanup

If you hit this before the fix, remove the stray nested dir the misfires created:

```sh
rm -rf <workspace>/.moi/.moi
```

---

# Review: the bundle cache & event model

## How a bundle flows

1. **CLI → control** (`server/cli.ts` → `server/control.ts`): `moi bundle` sends
   `{ type:'bundle', path, force, only }` over the control WebSocket. The handler resolves
   `path` to the owning workspace and calls `handleBundle` (widgets) + `handleBundleViews`
   (views).
2. **Kind-agnostic core** (`buildApplets`, `server/applets.ts`):
   - `scanSources` lists `.moi/<kind>/*.tsx|*.ts` (minus `*.server.ts`).
   - `pruneStaleBuilds` drops build dirs whose source is gone (and sweeps legacy flat
     `<name>.js`).
   - `needsRebuild` decides staleness per entry; stale entries compile through
     `buildApplet` (Bun.build) into `.build/<kind>/<name>/{index.js, chunk-*.js, assets}`.
3. **Per-kind wrap-up** (`server/widgets.ts`, `server/views.ts`): update the manifest
   (`config`; views also keep a first-seen `order`), reload changed server modules, and
   publish live events.

## The cache (staleness) model

It is **file-mtime based, per entry** — no content hashing, no sidecar cache file. An
entry rebuilds when its built `index.js` is missing, or when the source — or any
`.server.ts` / asset it **directly** imports — has an mtime `>=` the built entry's
(`needsRebuild`). `--force` ignores mtimes entirely.

- **Good:** zero extra state, survives restarts, trivially correct for the common
  "edit a widget, rebundle" loop.
- **Blind spot — transitive deps.** `needsRebuild` only scans the _entry source_ for
  `.server.ts` and asset imports (`scanServerImports` / `scanAssetImports`). A shared
  helper imported by the entry (a plain local `.ts` that's neither a `.server.ts` nor an
  asset), or a file imported _by_ a `.server.ts`, is **not** tracked — editing it won't
  mark the entry stale, so you need `--force`. A content-hash of the full input graph (or
  walking Bun.build's module graph) would close this.
- mtime comparison is `>=`, so same-second edits err toward rebuilding (safe).

## The event model

`publishEvent` (`server/events.ts`) broadcasts JSON over the `/api/workspaces/ws` pub/sub
topic to every connected browser — fire-and-forget, no ack; with no browser connected the
event is simply dropped (the next page load reads fresh bundles off disk). On a bundle:

- `widget:updated` / `view:updated` per built applet → the client cache-busts and
  re-imports that module (no page reload).
- `widget-layout:updated` / `view-layout:updated` only when membership / config / order
  changed → the client refetches the layout list.
- Changed `.server.ts` modules → `reloadModules` hot-swaps code **inside** the live
  functions worker (distinct from `restartWorker`, which fully respawns on an env change).

## What could be done differently

1. **Auto-rebundle in dev (the "forgot to rebundle" gap).** The dev supervisor watches
   only `server/` + `lib/` (`server/cli.ts`); Bun HMR covers `client/` but **not**
   workspace `.moi/views` / `.moi/widgets`. Every applet edit needs a manual `moi bundle`,
   with no signal the build is now stale. A `moi bundle --watch` (or having the server
   watch each registered workspace's source dirs and debounce-rebuild) would close it —
   the refresh-event plumbing above already exists, so the browser would update on its own.
2. **Track transitive inputs** so shared-helper edits invalidate dependents without
   `--force` (see the staleness blind spot).

> Path resolution is now unified: `bundle`, `theme`, `config`, and `scratch` all resolve
> through `findWorkspaceForPath`, and `moi init` lifts via `liftToWorkspaceRoot` — so every
> command works from a subdirectory and none can create a nested `.moi/.moi`.

## Code references

- `server/registry.ts` — `findWorkspaceForPath` (path → owning workspace) and
  `liftToWorkspaceRoot` (lift a `.moi/` path to the workspace root).
- `server/control.ts` — `resolveWorkspace` (shared by bundle/theme/config/scratch); the
  bundle branch replies `{ ok, workspacePath, results }`.
- `server/moi-scaffold.ts` — `scaffoldMoiDir` refuses to scaffold inside a `.moi/`.
- `server/cli.ts` — `init` lifts to the workspace root + flags a stray `.moi/.moi`; `bundle`
  plain tabular output + error handling.
- `server/applets.ts` — `getAppletPaths`, `needsRebuild` (mtime cache), `buildApplets` (guarded `mkdir`).
- `server/widgets.ts` / `server/views.ts` — manifest write gated on build-dir existence; live events.
- `server/cli-ui.ts` — `columns` / `keyValue` plain-text renderers.
- `server/events.ts` — `publishEvent` (server→browser live events).
