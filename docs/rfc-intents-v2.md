# RFC: workspace tab navigation and applet messaging (intents v2)

Status: draft · Supersedes the prototypes reviewed in PR #52 (direction kept, code dropped) and
PR #53 (capability routing not taken).

## Summary

Chat, widgets, and views communicate through three mechanisms: **URL-routed tabs** (navigation is
the address), **applet-defined params** delivered via navigation state, and **chat messages fired
from applet UI**. The "intent" vocabulary disappears from the API surface — the primitives are
`focusTab`, `sendChatMessage`, and plain routes.

## 1. Routes: the URL is the tab address

- Route becomes `/workspace/:id/*?` — the wildcard suffix is a tab id:
  `/workspace/ws1/view:roadmap`, `/workspace/ws1/widgets`, `/workspace/ws1/scratchpad`,
  `/workspace/ws1/view-builder:abc`. Tab ids are URL-safe as-is (`:` is a legal path character).
- **Missing tab** (`/workspace/:id`) → redirect to the workspace's default tab (the layout's
  saved `active`, same behavior as today), using a **history replace** so Back never bounces
  through the redirect.
- **Fully wired to navigation**: `openTab` becomes a wouter `navigate`; the tab bar, focus
  events, and applet calls all go through the router.
- History discipline: **replace, always.** Tab switches never create history entries — Back
  leaves the workspace rather than walking tab history. Tabs are surfaces, not pages; in-app
  back for widget → view drill-downs is a non-goal.
- **Unknown/dead tab in the URL** (deleted view, stale bookmark): redirect (replace) to the
  default and record a line in the applet journal (`moi debug logs`) so the agent can see its
  stale link.
- A URL-navigated tab that is not in the open set is auto-added to the tab bar (same as `openTab`
  does today).

## 2. Saved tab state stays in the layout; "active" means "default"

`layout.tabs` (`open` + `active`) stays in the workspace layout (`.moi/layout.json`) — no move
to the per-system store for now. What changes is the **meaning** of `active`: it is the
workspace's **default tab**, not live focus state.

- **Live truth** is each browser tab's URL. The saved default answers exactly one question —
  where a bare `/workspace/:id` lands — and marks the row in `moi tabs`.
- The write path is unchanged: navigating updates the saved default through the same layout
  persistence as today (debounced, last writer wins across clients).
- Known caveat, accepted for now: a synced workspace folder syncs the default and the open set
  with it. Moving this per-user UI state to the per-system store (`DATA_DIR`) remains the
  eventual fix — deferred until after the routing work lands.

## 3. Commands

```
moi tabs            # alias: moi tab — all tabs, one per row, the default one marked
moi tab focus <tab-id> [--params '<json-object>']
```

- `moi tabs` prints tab id + title; the marked row is the saved default (`layout.tabs.active`).
- `moi tab focus` validates the tab id server-side (unknown id fails listing the valid ids), then
  publishes a workspace-scoped `tab:focus` event; every connected client of that workspace
  navigates (replace) with the params in navigation state. Addressing is by **tab id**, never by
  title — titles are ambiguous and rename.
- Per-client targeting (focus only the browser tab the user is looking at) stays deferred.

## 4. Params: the applet decides

There is no params declaration in config — no runtime registration, no registry. The contract is
**source-level**: a view that has addressable state defines a `Params` type in its own file, all
fields optional, with comments. Other agents learn the contract by reading the view source (the
skill instructs this).

How an agent authors a view with params — the type IS the contract, so every field gets a
comment and every field is optional (the view must render sensibly with `{}`: fresh mount,
new browser tab, or a plain tab-bar click):

```tsx
// .moi/views/orders.tsx
import { useState } from 'react'

import { listOrders } from './orders.server'

export const config = { title: 'Orders', icon: 'package' } as const

// The view's addressable state — what `focusTab('view:orders', …)` can set.
// Other agents read this file to learn how to talk to this view.
export type Params = {
  // Order id to open in the detail pane; omit to show the list.
  order?: string
  // Narrow the list to one status: 'open' | 'shipped' | 'refunded'.
  status?: string
}

export default function Orders({ params = {} }: { params?: Params }) {
  const openOrder = typeof params.order === 'string' ? params.order : null
  // openOrder === null → the list; otherwise the detail pane. Values arrive
  // from navigation state, so narrow types before trusting them.
  …
}
```

And the emitter side, wired only after reading that file (per the skill rule). Applets are
independent — **widgets and views never import from each other, not even types.** The `Params`
type is documentation: the emitter mirrors the shape it read in the target's source, and notes
where it read it:

```tsx
// .moi/widgets/late-orders.tsx — a widget row drilling into the orders view
import { focusTab, sendChatMessage } from 'moi'

// Params contract read from ../views/orders.tsx: { order?: string; status?: string }
const openOrder = (order: string) => focusTab('view:orders', { order })

const chaseOrder = (order: string, carrier: string) =>
  sendChatMessage(`Chase order ${order}`, { order, carrier })
```

- **Widgets: `params` is always `{}`** — widgets are not navigation targets and have no
  addressable state.
- **Views: `{}` or the values from navigation state.** Delivery rides wouter's navigate state —
  `navigate(`/workspace/${id}/view:shop`, { state: { appletParams: { product: 'scarf' } } })` —
  and the host reads history state and passes the `params` prop. Params must be
  JSON-plain (history state is structured-cloned; keep it serializable).
- Persistence semantics: history-entry state survives reload, but is **not** in the URL — links
  and new tabs open the view with `{}` (and with replace-always navigation there is no back-stack
  of param states). Upgrade path if deep-linking is ever wanted: mirror params into the query
  string; explicitly deferred.
- Discovery: `moi tabs` does not print params — by design. The contract lives in the source; the
  skill instructs agents to read the target view's file (its `Params` type and comments) before
  wiring to it.

## 5. Applet API

```ts
import { focusTab, sendChatMessage } from 'moi'

focusTab(tab: WorkspaceTabId, params?: Record<string, unknown>): void
sendChatMessage(label: string, context?: Record<string, unknown>): void
```

- Delivery mechanics: bundle stubs delegating to the host `window.moi` bridge; no-ops outside
  the moi host; `sendChatMessage` self-attributes with the applet's `<kind>:<name>`.
- `focusTab` from an applet is client-local navigation (replace) — no server round-trip.
- `sendChatMessage` always targets the **active chat**. Envelope discipline: `label` is the
  visible message text; `{ source, context }` rides the `<moi-context>` envelope under an
  `# Applet message` section; busy chat parks the label as the composer draft (context dropped —
  accepted gap). Envelope symmetry: while a view is active, user messages carry its current
  `params` values, read from navigation state.

## 6. Naming

The word "intent" stays out of the API: the focus event is `tab:focus`, the envelope section is
`# Applet message`, and the product nouns are tabs, params, and chat messages.

## Decisions

1. **Chat targeting** — `sendChatMessage` always targets the **active chat**. No artifact-linked
   routing.
2. **Attribution** — an applet-sent message renders like a regular user message for now; a
   visible source chip with inspectable context is future UI work. (The trust/injection concern
   stands — the envelope still names the source applet, so the agent knows, even though the user
   can't see it yet.)
3. **Busy chat** — draft-parking stays: the label lands in the composer, the structured `context`
   is dropped, the user sends manually. A real queue is a possible later upgrade, not v2 scope.

## Staging

- **MVP 1 — tab foundation (first PR):** the working end-to-end core and nothing else. URL-routed
  tabs with replace-only navigation and the default redirect; the `params` prop delivered to
  views from navigation state; `focusTab` in the `moi` module; `moi tabs` / `moi tab focus` CLI
  with the `tab:focus` event. Explicitly out: skill changes, `sendChatMessage`, envelope changes,
  dead-URL journaling.
- **MVP 2 — chat messaging:** `sendChatMessage` + the `# Applet message` envelope section +
  params symmetry in the envelope; dead-URL journaling.
- **MVP 3 — authoring:** skill guidance (`Params` type convention, read-the-source rule, CLI
  usage), then fold the surviving parts of this RFC into permanent docs.
