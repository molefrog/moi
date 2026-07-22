# Intents

Intents are how the three surfaces of a workspace — chat, widgets, and views — talk to each
other. This is the address-based v1: an intent targets a **tab id** (`agent`, `widgets`,
`scratchpad`, `view:<id>`), and views declare a **params** contract that focus intents fill.

## The params contract

A view declares its addressable state in its config (`lib/types.ts` → `ViewConfig.params`):

```ts
export const config = {
  title: 'Shop',
  params: { product: 'Product slug shown in the detail pane' }
} as const
```

The map (name → one-line description) is parsed at bundle time
(`server/bundler/build-applet.ts`), stored in the view manifest, and surfaced by `moi tabs` so an
agent can discover what each view accepts. Current param _values_ are ephemeral client state
(`client/features/workspace/intents.ts` — in-memory, never persisted into the layout) and reach
the mounted view as a single `params` prop, `{}` until a focus intent sets them.

## The three flows

- **Chat/agent → view** — the agent runs `moi focus view:shop --params '{"product":"scarf"}'`.
  The CLI sends a control message (`server/control.ts`), which validates the tab id (unknown ids
  fail with the valid list) and publishes an `intent:focus` workspace event. Every open tab of
  that workspace switches to the target and hands it the params.
- **Applet → chat** — applet code calls `sendAction(label, context?)` (from the `moi` module).
  Idle chat: the message goes out immediately — `label` is the visible text, while
  `{ source, context }` rides the hidden `<moi-context>` envelope as its `intent` field
  (`lib/moi-context.ts`), rendered as an `# Applet action` section. Busy chat: the label is
  parked as the composer draft and the chat is surfaced, so the run is never interrupted and the
  action is never dropped (the structured `context` is lost on this path — an accepted MVP gap).
- **Applet → view** — applet code calls `focus(tab, params?)` (also from `moi`). Same dispatch as
  the agent flow, minus the server round-trip: params are stored and the tab is activated
  client-side.

Both `focus` and `sendAction` are stubs baked into every applet bundle that delegate to the
host-installed `window.moi` bridge (`MoiAppletRuntime` in `lib/types.ts`); outside the moi host
they no-op. `sendAction` self-attributes with the applet's own `<kind>:<name>` id.

## Envelope symmetry

While a view with params is active, ordinary user messages include the current values as
`tabParams` in the envelope's active-tab section — so "make this cheaper" tells the agent it is
about product `scarf` without the user saying so.

## Discovery

`moi tabs` prints the manifest — static tabs plus each view with its declared params — assembled
server-side from the view list (`server/views.ts` → `assembleWorkspaceTabs`).

## Deliberately deferred

- **Queueing on a busy chat** — a busy `sendAction` parks the label as a draft instead of
  queueing the full structured action.
- **Per-client focus scoping** — `intent:focus` reaches every open tab of the workspace, not the
  one the user is looking at.
- **Widget-level addressing** — intents target tabs; individual widgets are not addressable.
- **URL persistence of params** — params don't survive a reload and can't be deep-linked.
- **Capability-based routing** — targets are concrete tab ids; there is no "whatever can show a
  product" indirection.
