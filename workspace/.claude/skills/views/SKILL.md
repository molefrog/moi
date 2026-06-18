---
name: views
description: Build and modify workspace "views" — full-screen, full-stack apps embedded in the workspace (CRM, kanban board, data table, dashboard page). Use when the user asks to create, edit, or customize a view, build a full-page app, or asks what views are or how they differ from widgets.
---

# Views

Views are full-screen, agent-authored **apps** that live in the workspace nav next to
Chat, Widgets, and Scratchpad. The user switches to a view via its tab; one view fills
the whole main area at a time. Use a view (not a widget) when the work needs real
estate and its own layout — a contacts table, a kanban board, a settings page, a report.

A view is a **widget without the grid**. The build, server functions, dependencies, and
environment variables work *exactly* like widgets — read the `widgets` skill for those
shared mechanics. This doc only covers what differs.

## Views vs widgets — the differences that matter

| | Widget | View |
|---|---|---|
| Location | `.moi/widgets/<name>.tsx` | `.moi/views/<name>.tsx` |
| Size | fixed grid cell (`colSpan`/`rowSpan`) | full screen, dynamic |
| Root element | content-only, **no** chrome | **owns its layout AND scroll** |
| `config` | `{ colSpan, rowSpan, requiredEnv? }` | `{ title?, requiredEnv? }` |
| Shown | many at once on a grid | one at a time, via a nav tab |

The mental model is **inverted** from widgets: a widget is a bare rectangle the host
frames for you; a view is a whole page you frame yourself.

- The view root should be `w-full h-full` and **handle its own scrolling**
  (`overflow-auto`) — there is no outer scroll container.
- Provide your own padding, headers, and structure. A view *should* look like an app
  page, not a naked card.
- **One view = one screen.** There is no client-side routing inside a view; navigation
  between screens is the workspace nav. Internal sub-navigation (tabs within the view)
  is up to you.

## File structure

| File | Purpose |
|------|---------|
| `.moi/views/<name>.tsx` | The view's default-exported React component (required) |
| `.moi/views/<name>.server.ts` | Server-side async functions the view can call (optional) |

Keep views and their `.server.ts` files together in `.moi/views/` — flat, no subfolders.
Dependencies, `react`/`react-dom` stubs, and `process.env` access all behave exactly as
documented in the `widgets` skill.

## Config

```tsx
export const config = { title: 'CRM', requiredEnv: ['CRM_API_KEY'] }
```

- `title` — the nav tab label. Defaults to the file name when omitted.
- `requiredEnv` — advisory only, same as widgets (surfaced in the env UI, never
  enforced). Always handle a missing key yourself.

No sizing fields — views are always full-screen.

## Anatomy

```tsx
// crm.tsx
import { useEffect, useState } from 'react'

import { getContacts } from './crm.server'

export const config = { title: 'CRM' }

type Contact = { id: number; name: string; stage: string }

export default function CRMView() {
  const [rows, setRows] = useState<Contact[]>([])
  useEffect(() => {
    getContacts().then(setRows)
  }, [])

  return (
    <div className="h-full w-full overflow-auto p-8">
      <h1 className="mb-6 text-xl font-semibold">Contacts</h1>
      {/* …your app… */}
    </div>
  )
}
```

Server functions in `.moi/views/<name>.server.ts` are called exactly like a widget's —
named `async function`s, auto-serialized args/results. See the `widgets` skill for the
loading/error/success pattern, working directory, and env handling.

## Workflow

1. Create or edit `.moi/views/<name>.tsx` (and optionally `<name>.server.ts`).
2. Run `moi bundle` — it builds widgets **and** views; the browser picks up changes
   automatically. Use `moi bundle --only views` to build just views.
3. The new view appears as a nav tab. Tab order is **creation order** (the order views
   were first built), and is stable across rebuilds.

## Commands

- `moi bundle` — compile changed widgets and views
- `moi bundle --only views` — build only views
- `moi bundle --force` — rebuild everything (use after changing `config`)
- `moi refresh` — re-fetch data without rebuilding

## Rules

- Same as the `widgets` skill: never read or modify files outside the workspace, don't
  touch the web server, use only `moi` commands plus `bun` for dependencies.
- A view tab only appears once the workspace also has at least one widget (the nav bar
  shows alongside the widget grid). If a view isn't reachable, ensure the workspace has
  a widget.
