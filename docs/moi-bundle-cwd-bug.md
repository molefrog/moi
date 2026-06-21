# Bug: `moi bundle` silently no-ops from the wrong directory

**Status:** open · diagnosed 2026-06-19 (from the Faroe Lightroom workspace thread)
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
to the server (`server/cli.ts:301`). The control handler uses that path **directly as
the workspace root, with no validation** (`server/control.ts`, bundle branch:
`workspacePath = String(data.path ?? workspaces[0].path)`), and `getAppletPaths` blindly
joins `.moi` onto it (`server/applets.ts:34-40`):

```ts
const moiRoot = join(workspacePath, '.moi') // <path>/.moi
const sourceDir = join(moiRoot, 'views') // <path>/.moi/views
const buildDir = join(moiRoot, '.build', 'views') // <path>/.moi/.build/views
```

Run from inside `.moi/`, `workspacePath = <ws>/.moi`, so it targets the **phantom nested**
`<ws>/.moi/.moi/views` (no sources) and `<ws>/.moi/.moi/.build/views`.

The failure chain:

1. **Silent false success** — no sources → empty table, **exit 0**. Looks like it worked.
2. **Junk scaffold** — `buildApplets` runs `mkdir(buildDir, {recursive:true})`
   _unconditionally_ (`server/applets.ts:334`), creating the nested `.moi/.moi/.build/`.
3. The real build (`<ws>/.moi/.build/views/<name>`) is never touched → stays stale; the
   open view keeps showing the old bundle.

Inconsistency: the sibling `moi scratch` control handler _does_ validate the path
(`workspaces.find(w => w.path === path)` → errors `No workspace registered at ${path}`).
`bundle` skips that check.

## Contributing issues

- **Empty discovery reads as success** — zero applets prints an empty table and exits 0
  with no warning, masking both "wrong dir" and "not a workspace".
- **No auto-rebundle ("forgot to rebundle")** — the dev supervisor watches only `server/`
  - `lib/` (`server/cli.ts:122`); Bun HMR covers `client/` but **not** workspace
    `.moi/views` / `.moi/widgets`. Every applet edit needs a manual `moi bundle`, with no
    signal that the build is now stale. (Live-refresh itself works: `handleBundleViews`
    publishes `view:updated` / `view-layout:updated`, `server/views.ts:151,162`.)

## Proposed fix

1. **Resolve to the real workspace root** (the actual bug). In the bundle control handler,
   resolve the requested path to the registered workspace it lives in — match the path or
   its nearest ancestor (git-style), error clearly otherwise:

   ```ts
   const reqPath = resolve(String(data.path ?? '.'))
   const ws = workspaces.find(w => reqPath === w.path || reqPath.startsWith(w.path + sep))
   if (!ws) {
     send({
       error: `${reqPath} is not inside a registered moi workspace — open it in moi, or run from the workspace root.`
     })
     return
   }
   // bundle ws.path
   ```

   Makes `moi bundle` work from `.moi/` or any subdirectory, and fail loudly when it's
   nowhere near a workspace.

2. **Don't fake success / don't scaffold junk** — if discovery finds 0 sources, warn and
   exit non-zero; only `mkdir(buildDir)` after ≥1 source is found.

3. **Auto-rebundle in dev** (closes "forgot to rebundle") — a `moi bundle --watch`, or have
   the dev supervisor watch each registered workspace's `.moi/views` + `.moi/widgets` and
   debounce-rebuild on change (the refresh-event plumbing already exists).

## Cleanup

Remove the stray nested dir the misfires created:

```sh
rm -rf /Users/molefrog/git/faroe-lightroom/.moi/.moi
```

## Code references

- `server/cli.ts:301` — `bundle` sends `path = resolve(args.dir)` (the CWD).
- `server/cli.ts:122` — dev supervisor watches only `server/` + `lib/`.
- `server/control.ts` — bundle branch uses `data.path` unvalidated (vs. `scratch` which validates).
- `server/applets.ts:34-40` — `getAppletPaths` joins `.moi` onto the given path.
- `server/applets.ts:334` — `buildApplets` `mkdir(buildDir)` unconditionally.
- `server/views.ts:151,162` — view live-refresh events (these work).
