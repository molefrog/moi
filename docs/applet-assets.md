# Applet I/O — assets · server calls · files

> Design memo (not built). How an applet (widget/view) reaches the outside:
> bundled assets it imports, server functions, and workspace files. One base,
> three transports.

## One base, swapped at serve

The build bakes one sentinel `%%MOI_API_BASE%%`; the serve route string-replaces
it (it only needs the id) in every `.js` it returns. So the on-disk bundle is
workspace-agnostic, and the served copy carries its base:

```
%%MOI_API_BASE%%  →  /api/workspaces/<id>
```

`rpc` and `fs` are **workspace-scoped** — they hang off this base. Bundle files
(entry/chunk/asset) are **applet-scoped** and don't need the sentinel; assets
self-locate via `import.meta.url`. This replaces the `window.__MEI_WS__` global.

```
.moi/.build/views/editor/      served at  /api/workspaces/<id>/views/editor/
  index.js          entry      ← served, sentinel-swapped
  chunk-<hash>.js   chunk      ← served, sentinel-swapped
  img-<hash>.png    asset      ← streamed raw
```

Two route families — applet files (per applet) and workspace I/O (per workspace).
Kind is a **literal** segment (`widgets`/`views`), not a param — a param would
shadow the sibling routes (`/sessions`, `/env`, …). The `*` tail is `<name>/<file>`:

```
GET /api/workspaces/:id/widgets/*         ┐ applet file: <name>/<file>
GET /api/workspaces/:id/views/*           ┘ (entry / chunk / asset)
GET /api/workspaces/:id/fs/*              → workspace-root file (Bun.file: range)
... /api/workspaces/:id/rpc/<module>/<fn> → workspace worker (run server fn)
```

Example paths (widget `clips`, workspace `wsab12`):

```
entry   /api/workspaces/wsab12/widgets/clips/index.js
asset   /api/workspaces/wsab12/widgets/clips/logo-9f3a2b1c.png
chunk   /api/workspaces/wsab12/widgets/clips/chunk-7d4e1a09.js
fs      /api/workspaces/wsab12/fs/clips/001_copenhagen.mp4
rpc     /api/workspaces/wsab12/rpc/widgets/clips/listClips
```

## Three ways out

**Assets — `import img from './logo.png'`** (build-time, bundled). A Bun `onLoad`
plugin: hash + emit `logo-<hash>.png` next to the bundle, return
`export default new URL('./logo-<hash>.png', import.meta.url).href`. Self-locating
via the module URL, so it needs **no** base. Tiny files: `loader: dataurl` inlines
as base64.

**Server calls — `import { x } from './x.server'`** (RPC, behavior unchanged). The
stub becomes `fetch(BASE + '/rpc/' + module + '/' + name, …)` (devalue in/out),
replacing today's `/_rpc/<ws>/fn/…` and the global lookup.

**Workspace files — `fileUrl(path)`** (runtime, off disk). `BASE + '/fs/' + path`,
streamed with HTTP range. For media/binary that must not go through RPC. The path
is _data_ (e.g. a clip id from a `.server.ts`), so it's a helper, not an import.

## What the agent writes

```tsx
import logo from './logo.png'              // its own asset
import { fileUrl } from 'moi'              // workspace files
import { listClips } from './clips.server' // data + file paths

<img src={logo} />
<video src={fileUrl(clip.file)} controls /> // clip.file = 'clips/001_….mp4'
```

Rule of thumb: own-code asset → `import`; small data → `.server.ts`; large/
streamable file → `.server.ts` returns the **path**, render with `fileUrl()`.

## Types (editor DX only — the build needs none)

The bundler resolves asset imports and `moi` without any declarations; types are
only for the agent's editor / `tsc`. One ambient `.moi/applet-env.d.ts`, scaffolded
by `moi init`:

```ts
declare module 'moi' {
  // required: virtual module, Bun won't type it
  export function fileUrl(path: string): string
  export type WidgetConfig = {
    colSpan: 1 | 2 | 3 | 4
    rowSpan: 1 | 2 | 3 | 4
    requiredEnv?: string[]
  }
  export type ViewConfig = { title?: string; requiredEnv?: string[] }
}
declare module '*.png' {
  const s: string
  export default s
} // optional: jpg/svg/webp…
```

- RPC types are free — the agent imports the real `.server.ts`, so signatures flow
  from source (the build swaps it for the stub only at bundle time).
- `moi` is the one that _must_ be declared (the build plugin provides the impl).
- Image modules are optional: `bun-types` declares text/data formats
  (txt/yaml/json5/html) but **not** images — add these only for squiggle-free asset
  imports in the editor.
- Keep the `.d.ts` at `.moi/` **root** — inside `widgets/`/`views/` it matches the
  `.ts` build glob and would be compiled as an applet.

## To build

- **Build:** asset `onLoad` plugin; emit each applet into its own
  `.build/<kind>/<name>/`; bake `%%MOI_APPLET_API_BASE%%` into the rpc stub +
  `fileUrl`.
- **Serve:** applet routes `…/widgets/*` and `…/views/*` (literal kind) parse the
  tail as `<name>/<file>`, swap the sentinel in `.js` (entry **and** chunks), and
  serve the file (`Bun.file` sets content-type by extension; only swapped `.js`
  needs an explicit `text/javascript`). Separate `…/<id>/fs/*` (`Bun.file`) and
  `…/<id>/rpc/<module>/<fn>` (worker) routes.
- **`/fs` guards:** contain to workspace root (reject `..`), allowlist media
  extensions. That's the secret-leak guard — localhost binding is not.
- **Free:** dynamic `import()` chunks resolve module-relative; you only have to
  serve them.
