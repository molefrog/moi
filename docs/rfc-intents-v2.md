# RFC: workspace tab navigation and applet messaging (intents v2)

Status: MVP 1 (tab foundation) and MVP 2 (chat messaging) implemented; MVP 3 staged · Supersedes
the prototypes reviewed in PR #52 (direction kept, code dropped) and PR #53 (capability routing
not taken).

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

`layout.tabs` (`open` + `active`) stays in the workspace layout (`.moi/.workspace.json`) — no move
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

`moi tabs` output (colors omitted):

```
moi tabs — workspace tabs, the default one marked

     tab          title
  ●  agent        Agent
     widgets      Widgets
     scratchpad   Scratchpad
     view:orders  Orders
     view:shop    Shop

  Focus one: moi tab focus <tab-id> [--params '{"k":"v"}']
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
// Other agents read this file to learn how to talk to this view. Local on
// purpose (not exported): applets never import from each other, so exporting
// would only invite that mistake — the type is read, never imported.
type Params = {
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

- Delivery mechanics: the `moi` module is inlined **per bundle**, and the host attaches a thin
  **bridge** to each loaded module instance right after dynamic import (and neuters it on
  invalidation, so a stale rebuilt module can no longer act). All bridges forward to one
  **applet runtime** per workspace, which validates the untrusted args and emits typed events
  (nanoevents) that host features subscribe to independently — navigation owns `focusTab`, chat
  will own `sendChatMessage` (`client/features/applets/applet-runtime.ts`). Calls no-op before
  attach and outside the moi host. One applet cannot reach another's bridge — separate module
  scopes. Caveat: the bridge is per bundle, not per mount, so two simultaneous mounts of one
  applet share a bridge.
  `sendChatMessage` self-attributes with the applet's `<kind>:<name>`, derived by the runtime —
  never passed by the caller.
- The bridge wiring (`__attachBridge` / `__getBridge`, re-exported by every bundle entry) is host
  plumbing: it stays out of the author-facing ambient types (`.moi/applet-env.d.ts`), which
  declare only the public API — `fileUrl`, `focusTab`, and the config types.
- `focusTab` from an applet is client-local navigation (replace) — no server round-trip.
- `sendChatMessage` always targets the **active chat**. Envelope discipline: `label` is the
  visible message text; `{ source, context }` rides the `<moi-context>` envelope under an
  `# Applet message` section. Envelope symmetry: while a view is active, user messages carry its
  current `params` values, read from navigation state.
- **Reveal before send.** The chat is a closed popover on a view tab in full-screen mode, so an
  applet message opens it first (the same `openChat` path the widget grid and view builder use).
  A run the user cannot see is worse than a panel that opens itself.
- **Rate limiting is the host's job.** Each call starts an agent run, and the bridge is per
  bundle, so a `sendChatMessage` in render — or one applet mounted twice — would bill the user
  per frame. The runtime collapses an identical `source`+`label` inside a 2s cooldown and caps a
  workspace at 10 messages per minute. Drops are journaled to `moi debug logs`, never silent —
  from the applet's side a dropped call is a button that did nothing.
- **Validation caps.** A label over 1000 chars is dropped (it would land in a bubble verbatim); a
  `context` that isn't a plain object, doesn't serialize, or exceeds 2000 chars is dropped while
  the message still goes — the label carries the user's intent and must not be lost with the
  payload.
- **Envelope integrity.** Every applet-authored string interpolated into the envelope (view
  titles, applet names, both JSON blobs) has every `<` replaced by its JSON unicode escape — the
  same string to a reader, minus the ability to close `<moi-context>` early and forge a section
  the host never wrote.

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
3. **Busy chat** — ~~draft-parking~~ **revised during MVP 2: applet messages send straight
   through, running turn or not.** Draft-parking was written before the composer offered
   "Queue a follow-up": typed messages already queue into the live session, so parking would have
   made applet messages a special case whose only distinction was losing the structured
   `context`. An applet message is now exactly a typed one, minus the typing.
4. **Unavailable agent** — an applet message is dropped when the workspace's agent executable is
   missing, the same gate the composer's send button uses, and journaled so the dead button has
   an explanation.

## Staging

- **MVP 1 — tab foundation (first PR):** the working end-to-end core and nothing else. URL-routed
  tabs with replace-only navigation and the default redirect; the `params` prop delivered to
  views from navigation state; `focusTab` in the `moi` module; `moi tabs` / `moi tab focus` CLI
  with the `tab:focus` event. Explicitly out: skill changes, `sendChatMessage`, envelope changes,
  dead-URL journaling.
- **MVP 2 — chat messaging (implemented):** `sendChatMessage` + the `# Applet message` envelope
  section + params symmetry in the envelope; dead-URL journaling. Added on the way, not in the
  original plan: rate limiting, envelope escaping, and the `runtime` journal source — one line
  for anything the applet API refuses (a dead tab id, a dropped message), which the applet's own
  code never sees.
- **MVP 3 — authoring:** skill guidance (`Params` type convention, read-the-source rule, CLI
  usage), then fold the surviving parts of this RFC into permanent docs.
