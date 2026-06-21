# Scratchpad

**The Scratchpad is the workspace's shared whiteboard** — a freeform
[tldraw](https://tldraw.dev) canvas that lives in the workspace nav. The user draws on it;
the agent can see what's there and draw back. One canvas, two authors, disk is the source
of truth.

It's an infinite, low-fi space for sketching, diagramming, annotating, and thinking out loud
together — more spontaneous than the workspace's other surfaces, and the only one the user
and agent both draw on directly.

## For the user

- Open the **Scratchpad** tab to get a full tldraw canvas — pan, zoom, draw, shapes, text,
  arrows, sticky notes, the whole tldraw toolset.
- Whatever you draw is **saved automatically** into the workspace and survives reloads.
- It's **shared with the agent.** Ask it to look at your sketch, label a diagram, lay out
  boxes, or clean up an arrow — it sees the same canvas and edits it in place, live.
- It's **one canvas**, not separate copies. When the agent draws, the change appears on your
  screen; when you draw, the agent can read it. Open it in two tabs and they stay in sync.

## For the agent

The agent works the canvas through a `moi scratch` CLI — it both **sees** and **draws**.

### Seeing

- `moi scratch read` — dump the canvas as **structured JSON**: each shape with its `id`,
  `type`, position, size, and text. Use this to reason about exact shapes — what's where,
  what to move, what to relabel. Works whether or not a browser tab is open. Image shapes
  carry a `src`, but **base64 data URLs are omitted** (reported as `base64:omitted`) — the
  blob is huge and unreadable as text, so call `view` when you actually need to see it.
- `moi scratch view` — render the canvas to a **PNG**. Use this to actually _see_ what the
  user drew (freehand, layout, anything structure can't capture).

`read` is for logic; `view` is for vision.

### Drawing

The agent doesn't emit raw tldraw records. `moi scratch` exposes a small **primitive layer**
that maps onto tldraw's own shape API — friendly to drive and stable against tldraw's
internal schema:

```
moi scratch add text   --at <x,y> --text "..."          [--id NAME]
moi scratch add rect   --at <x,y> --size <w,h> [--text]  [--id NAME]
moi scratch add note   --at <x,y> --text "..."           [--id NAME]
moi scratch add arrow  --from <id|x,y> --to <id|x,y>     [--id NAME]
moi scratch move   <id> --to <x,y>
moi scratch set    <id> --text "..."        # relabel / edit
moi scratch delete <id>
```

- `--id` gives a shape a stable handle so later commands can address it; otherwise the
  command returns the generated id.
- `arrow --from <id> --to <id>` binds endpoints to shapes, so the arrow follows when the
  shapes move — same as drawing a connector between two boxes by hand.
- Coordinates are tldraw canvas space (origin top-left, y down).

The set is deliberately small — text, rect, note, arrow, plus move/set/delete. Enough to lay
out a diagram or annotate the user's drawing; not a full tldraw API.

## How it works

The canvas is a real tldraw editor running in the **browser** — that's where all drawing and
rendering happens, exactly like tldraw's own [Make Real](https://makereal.tldraw.com). The
moi server is a **relay and a disk store**, not a tldraw runtime; it never tries to
reconstruct tldraw shapes itself.

- **Persistence.** The browser autosaves the canvas to `.moi/scratchpad.json` (a tldraw
  document snapshot, owned by moi — not hand-edited). Saves are **debounced — about 500ms
  after you stop drawing**, not on every stroke — and each one writes the whole snapshot.
  Reloading rehydrates from it; a "canvas updated" signal pushes other open tabs to reload,
  so everyone converges.
- **Reading** (`moi scratch read`) is served straight from that snapshot on disk — the server
  parses the saved shapes into a compact listing. No browser required.
- **Drawing and viewing** (`add`/`move`/`set`/`delete`/`view`) are **relayed to the live
  editor** in a connected tab: the browser runs the op against tldraw (`createShape`,
  `updateShape`, `toImage`, …) and sends back the result (a new shape id, or a PNG). This is
  why draws produce valid shapes and `view` is pixel-faithful — tldraw itself does the work.
- **Each command targets its own workspace's canvas.** The CLI runs in a workspace directory,
  which resolves to that workspace; the relayed op carries that identity, and only a tab
  showing **that workspace's** scratchpad runs it. So `moi scratch view` from one workspace
  never returns another's canvas. "No live canvas" therefore means no tab is showing _this_
  workspace's scratchpad — `read` (off disk) still works regardless.
- **Concurrency is last-write-wins.** The browser is the only writer to disk, and the agent's
  draws run _inside_ that same editor, so they persist through the same autosave. If the user
  and agent touch the canvas at the same moment, the later save wins — edits are cheap and
  visible, so a clobbered change is easy to redo. No merging, no locking.

## Building it

Lean on what's already here rather than inventing plumbing. The canvas is a `<Tldraw>` mounted
in the existing Scratchpad slot; add `tldraw` as a dep (pin a React-19-compatible version) and
load its CSS. The server side mirrors the widget pattern — a small disk module for
`.moi/scratchpad.json` (like `layout.ts`), `GET`/`PUT` routes for the snapshot, the `moi scratch`
CLI hung off the control port next to `bundle`/`config`, and the existing MEI pub/sub for the
"canvas updated" nudge. Persist the snapshot's `document` only (drop the per-tab `session`), and
autosave off `store.listen({ source: 'user' })` so remote reloads don't echo. Build it in slices:
(1) canvas mounts, hydrates, and autosaves; (2) `read` parses the snapshot off disk; (3) `view`
plus the draw ops relay through a connected editor — the only genuinely new piece is correlating
a request to a browser and awaiting its reply. Everything before that is wiring existing parts
together.
