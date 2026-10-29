# Development server

Use Bun 1.3.14 or newer, matching the minimum development baseline in
`package.json`'s `packageManager` field. That field configures CI; it does not
switch the executable used by a local `bun run`.

```sh
bun upgrade --version 1.3.14
bun --version
bun install --frozen-lockfile
bun run dev
```

Stop an already-running development server once after upgrading. Its runtime
does not change when the executable on disk changes. The launcher checks the
development runtime before starting, and children use `process.execPath` so a
second Bun installation on `PATH` cannot silently change versions on restart.

## How edits reach the browser

- `bun run dev` runs the CLI's development supervisor. It starts a normal Bun
  server process, without `--hot`, and forces the live client even if `dist/`
  exists.
- `server/web.ts` passes the client HTML to `Bun.serve` with HMR enabled. Bun
  watches its frontend dependency graph, recompiles TSX/CSS with the plugins in
  `bunfig.toml`, and sends updates over its own browser WebSocket.
- React is shared with applets through the local import map. The preload loads
  React before `client/index.tsx` dynamically imports `client/main.tsx`. The
  React externalization plugin preserves that single instance.
- React Fast Refresh applies accepted component changes in place. If an update
  reaches a module without an accepting boundary, Bun reloads the browser
  automatically. This is expected for startup code and mixed exports; it does
  not require restarting the server.
- The supervisor separately watches `server/` and `lib/` TypeScript files and
  fully restarts the backend when they change. Frontend edits do not restart it.

## Why `QueryClient is not a constructor` happened

Bun 1.3.10 has a development-bundler bug in barrel exports (modules that
re-export other modules). In the chain
`@tanstack/react-query` → `export *` → `@tanstack/query-core`, its optimizer
can incorrectly defer the module exporting `QueryClient`. A rebuild can then
serve an import whose `QueryClient` property is `undefined`. A server restart
rebuilds the graph, which explains the temporary recovery.

The exact error and version are recorded in
[Bun issue #27860](https://github.com/oven-sh/bun/issues/27860). The underlying
[fix #27524](https://github.com/oven-sh/bun/pull/27524) restores the missing
export-star target flag in the dev bundler and is included in Bun 1.3.14.
This is not a QueryClient provider or Tailwind-class error.

The previous `accept-hmr-dependencies` plugin modified TanStack's package
entrypoints to self-accept updates. It has been removed: accepting a module
cannot repair incorrectly generated dependency exports. Use a fixed runtime
instead of rewriting dependencies, moving the QueryClient import, caching it
on `globalThis`, or restarting the server for frontend edits.

## Remaining Fast Refresh limitation

Bun 1.3.14 can also re-emit unchanged dependency barrels during component
updates. In this app, an update through the Tabler barrel can reach the mixed
exports in `client/components/ui/toast.tsx` and cause a full browser reload.
That is separate from the missing `QueryClient` export. Automatic reloads
reflect edits, but do not preserve all React state. A fixed QueryClient import
does not imply that every edit will use state-preserving Fast Refresh.

To check a runtime change, keep the server running and repeatedly edit component
text and add new Tailwind utilities. Verify the rendered text and computed CSS,
watch browser errors, and also open a fresh tab after a rebuild. A production
build or a unit test importing QueryClient does not exercise this dev-bundler
failure.
