# Intents

**Key idea:** applets, the CLI, and chat need to talk to each other — but wiring them by tab id or
prop name breaks the moment the agent renames or rebuilds a view. Instead, views **declare** named
intents they handle (`intents` in their config), and emitters dispatch by intent name. The system
routes each dispatch to whichever view declares it — like Android intents, capability-based rather
than address-based.

Why declared names instead of tab ids:

- **Rename-safe links** — a widget dispatching `open-product` keeps working when the products view
  is renamed, retitled, or rewritten, as long as _some_ view still declares the intent.
- **Queryable surface** — `moi intents` lists every declared intent (name, description, params,
  declaring view): the workspace's "what can it do" API, readable by the agent before wiring.
- **Future chooser** — when two views declare the same intent, routing today picks the first (nav
  order); the declaration model leaves room for a user-facing chooser later.

## Declaring

```ts
export const config = {
  title: 'Products',
  intents: [{ name: 'open-product', description: 'Open one product', params: { id: 'product id' } }]
} as const
```

Names are kebab-case verbs; malformed declarations are skipped at extract time (build-applet.ts),
never failing the build. Declarations land in the views manifest and ride the `/views` list, so
both the client resolver and the CLI see the same set.

## Flows

- **CLI dispatch** — `moi intent open-product --params '{"id":"p-42"}'` → control server resolves
  against the built views (a name nothing declares fails in the CLI, listing what is declared) →
  `intent:dispatch` workspace event → the client resolver switches to the declaring view's tab and
  passes `intent`/`params` props to its component. Delivered state is in-memory only.
- **Applet dispatch** — `import { intent } from 'moi'`; `intent('open-product', { id })` from any
  widget or view. Delegates to the host-installed `window.moi` runtime; the originating applet is
  recovered from the call stack (bundle URLs), so the dispatch carries a `source` like
  `widget:products`. A dispatch no view declares is recorded in the applet error journal
  (`moi debug logs`): `no view declares intent "open-product" (dispatched by widget:products)`.
- **Applet → chat action** — `sendAction('Reorder low stock', { sku })` sends a chat message: the
  label is the visible text, the structured context rides the `<moi-context>` envelope
  (`MoiContext.intent`). If a run is in progress the label parks as the composer draft instead —
  never interrupting, never dropping.

Every chat message's envelope also carries `availableIntents` (declared names only), so the agent
always knows the workspace's capability surface and where to look for details (`moi intents`).

## Deliberate deferrals (MVP)

- **Queueing on a busy chat** — `sendAction` during a run parks only the label as a draft; the
  structured context is dropped rather than queued.
- **Per-client scoping** — a CLI dispatch broadcasts to every tab showing the workspace; there is
  no targeting of one browser tab.
- **Multiple-handler chooser** — duplicate declarations resolve to the first view in nav order; no
  disambiguation UI.
- **URL persistence** — delivered intents are ephemeral in-memory state; a reload clears them and
  they are never written into the workspace layout.
