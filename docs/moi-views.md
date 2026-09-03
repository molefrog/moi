# Custom Views

**Key idea:** a workspace can define full-screen, full-stack "apps" — _views_ — that
live in the workspace nav alongside Agent / Overview / Scratchpad. Think dashboard
pages: a users table, a kanban board, a CRM. At most one view is visible at a time;
the user switches via the nav tabs.

Views are **widgets without the grid**. The entire widget backend (Bun bundle, RPC
stubs, `.server.ts` worker pool, Tailwind inlining, dynamic-import rendering,
manifest discovery) is reused. The differences are all at the edges: where files
live, the config shape, and how they mount.

## Authoring

```
.moi/views/<name>.tsx          # default export = the view's root React component
.moi/views/<name>.server.ts    # optional async server functions (same as widgets)
```

```tsx
import type { ViewConfig } from '@/lib/types'

export const config: ViewConfig = { title: 'CRM' }

export default function CRMView() {
  // Owns its own layout AND scroll. Root should be w-full h-full.
  return <div className="w-full h-full overflow-auto">…</div>
}
```

- **Authored by the agent only**, via the CLI (`moi bundle`). There is no UI affordance
  to create a view; the "Create New" tab entry is a no-op for now.
- Unlike widgets, a view is a **real app**: it provides its own chrome, layout, and
  internal scrolling. No fixed grid cell, no `rowSpan`/`colSpan`.
- **One view = one screen.** No internal client-side routing; navigation between
  views is the workspace nav. (Sub-navigation inside a single view is up to the view.)

## Config

```ts
export type ViewConfig = {
  title?: string // nav tab label; defaults to the file name
  requiredEnv?: string[] // advisory, surfaced in env UI — never enforced
}
```

No sizing fields. (Reuses the same `export const config` AST-parse path as widgets.)

## Server functions

Identical to widgets. RPC module keys are path-relative, so `.moi/views/crm.server.ts`
is addressed as `views/crm` and routed through the existing
`POST /_rpc/<id>/fn/views/crm/<fn>` — **no backend changes needed**. Same worker pool,
IPC, timeout, and idle-evict.

## Build

- `moi bundle` (default) scans **everything changed** — widgets _and_ views — and
  rebuilds only stale entries (mtime diff, same as widgets today).
- Optional flag narrows scope (e.g. build only views, or a single entry).
- Build pipeline is **parameterized** (`kind: 'widget' | 'view'`), not forked: one
  pipeline, two scan dirs, two manifests.

Output:

```
.moi/.build/views/<name>.js          # ESM module, default export + injected CSS
.moi/.build/views/manifest.json      # { config: { <name>: ViewConfig }, order: [<name>, …] }
```

- **Order** is stored in the manifest (creation order: a new view appends to `order`).
  The nav renders tabs in `order`.

## Discovery & API

Mirrors widgets:

- `GET /api/workspaces/:id/views` → `{ views: ViewInfo[] }` (`ViewInfo = { id, config }`,
  in manifest `order`).
- `GET /api/workspaces/:id/views/:name.js` → serves the built bundle.
- Client refetches the list on the relevant MEI rebuild event.

The view list is **never persisted in layout** — it's derived from the filesystem /
manifest. Only the _active_ view is client state.

## Client rendering

- `WorkspaceTabs` renders a tab per open view; the tab address lives in the URL and
  the open set is persisted in `.moi/.workspace.json`.
- `client/features/views/ViewManager.tsx` owns the view surface: it loads a view's
  bundle, mounts it full-area behind an error boundary, and holds its scoped
  `<style>` for as long as the view is mounted.

### Mounting and lifecycle

A view is **not** remounted on every tab visit. The one on screen is visible;
recently-visited ones stay mounted but hidden behind React's `<Activity>`, so a
switch back is instant and the view's component state survives it.

- **First open** — the bundle is fetched behind a centered splash, then rendered.
- **Switching between loaded views** — instant, no transition. There is no
  enter/exit animation between views: a view carries its own styles, and
  animating the swap means painting frames after the styles are gone.
- **Parked** — hidden with `display: none`. React unmounts the subtree's effects
  while it is hidden and runs them again on return, so a view's effects behave
  like a remount even though its state does not. Scroll position is not kept.
- **Disposed** — after the retention window (`view-residency.ts`), when the view
  is deleted, or immediately when the workspace closes.
- **Rebuilt** — a view rebuilt while parked picks the new build up in place. One
  rebuilt while you are looking at it keeps showing the previous build until the
  new one is ready, then dissolves the new build in over it (200ms blurred fade,
  the only animation the view surface has). No splash between edits.

Only the active view's stylesheet is kept last in `<head>`. Applet CSS is scoped
per container, but the names of global at-rules (`@keyframes`, `@property`) are
not — so with several views mounted at once, the one on screen wins those names.
