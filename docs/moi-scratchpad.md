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
  blob is huge and unreadable as text, so use `read-image` or `view` for the pixels.
- `moi scratch read-image <id>` — save a single image shape's bytes to a file (prints the
  path). Served off disk, like `read` — this is how the agent pulls the pixels of one image
  that `read` omitted. A remote (`http`) asset prints its URL instead.
- `moi scratch view` — render the **whole canvas** to a **PNG**. Use this to actually _see_
  what the user drew (freehand, layout, anything structure can't capture).

`read` is for logic; `view` / `read-image` are for vision.

### Drawing

The agent doesn't emit raw tldraw records. `moi scratch` exposes a small **primitive layer**
that maps onto tldraw's own shape API — friendly to drive and stable against tldraw's
internal schema:

```
moi scratch add text   <pos> --text "..."               [--id NAME] [--color C] [--font-size S]
moi scratch add rect   <pos> [--size <w,h>] [--text]     [--id NAME] [--color C] [--fill F] [--font-size S]
moi scratch add note   <pos> --text "..."                [--id NAME] [--color C] [--font-size S]
moi scratch add arrow  --from <id|x,y> --to <id|x,y>     [--id NAME] [--color C] [--stroke S] [--elbow]
moi scratch add image  <path>                            [--at <x,y>] [--id NAME] [--quality lo|hi]
moi scratch move   <id> --to <x,y>
moi scratch set    <id> --text "..."        # relabel / edit
moi scratch align      <id> <id> [...] --edge left|right|top|bottom|center-x|center-y [--to <id>]
moi scratch distribute <id> <id> <id> [...] --axis x|y [--gap N]
moi scratch autosize   <id> [...]           # re-fit labeled rects to their labels
moi scratch tidy [--grid N]                 # snap to grid + pull near-aligned edges together
moi scratch delete <id>
moi scratch clear                           # wipe the whole canvas
```

- `<pos>` for text/rect/note is either an absolute `--at <x,y>` **or a relative placement**:
  `--below <id>`, `--above <id>`, `--left-of <id>`, `--right-of <id>`, optionally with
  `--gap <n>` (distance from the anchor, default 48) and `--align start|center|end`
  (cross-axis alignment to the anchor, default `center` — e.g. `--below a --align start`
  puts left edges flush). Exactly one of the two; the server resolves the anchor's real
  bounds, so relative placement is exact where guessed coordinates aren't. Arrows can't
  be anchors (their geometry lives in bindings).
- `rect --size` is optional: omitted with `--text`, the server measures the label with the
  actual canvas font and sizes the box to fit (so the label can never overflow); omitted
  without text it falls back to a 160×96 node box. Give an explicit size only when the box
  isn't label-driven (e.g. a container drawn around other shapes).
- The arrangement verbs are the align/distribute/snap of a design tool. `align` lines the
  listed shapes' chosen edge or center up with the anchor's (`--to`, default the first
  listed) and moves them only on that axis. `distribute` spaces shapes along an axis in
  their current order — with `--gap` it repacks at exactly that spacing (first shape stays
  put); without, the first and last stay fixed and the gaps between are equalized.
  `autosize` re-fits labeled rects to their labels in place (top-left kept). `tidy` is the
  canvas-wide pass: snap every position (and rect size) to the grid (default 8px), then
  pull edges and centers that are within 10px of lining up exactly together. All four skip
  arrows — bound arrows follow their shapes on their own.
- `--id` gives a shape a stable handle so later commands can address it; otherwise the
  command returns the generated id.
- `arrow --from <id> --to <id>` binds endpoints to shapes, so the arrow **follows** when the
  shapes move — that's the connector you reach for in a diagram. Add `--elbow` for
  right-angle (squared) routing instead of the default curved arc.
- `--color` takes one of the **six palette names the UI toolbar offers** — `black`, `red`,
  `yellow`, `green`, `blue`, `grey` — **or any hex** (e.g. `#4465e9`), which is snapped to the
  nearest of those six (tldraw shapes only hold palette colors). The remaining style flags differ
  per shape, mirroring that shape's toolbar controls: `--fill` (rect) is `none|semi|pattern|solid`
  and defaults to `semi` (rects are always a rough hand-drawn outline, like the toolbar draws);
  `--font-size` (text, note, and a rect's label) is `regular|big`; `--stroke` (arrow) is the line
  weight, `small` or `large`. Omit the size/stroke flags to keep tldraw's default. The agent's
  options deliberately match what the user can pick by hand — neither surface can make something
  the other can't.
- `add image <path>` embeds a local image file. The server **resizes it to fit the canvas** —
  `--quality lo` (default, long side ≤768px) or `hi` (≤2048px) — re-encoding to WebP so a 10MB
  paste never lands on the canvas whole. `lo` keeps the constantly-rewritten snapshot light and
  is well within Claude's vision budget; reach for `hi` only when fine detail (e.g. screenshot
  text) matters. EXIF orientation is baked in; images are never enlarged.
- `clear` deletes every shape on the canvas in one shot.
- Coordinates are tldraw canvas space (origin top-left, y down).

The set is deliberately small — text, rect, note, arrow (with color plus each shape's
fill/font-size/stroke), plus
move/set/delete/clear and the arrangement verbs. Enough to lay out a diagram or annotate the
user's drawing; not a full tldraw API.

### Laying out a diagram

The failure mode to avoid is coordinate arithmetic: computing absolute positions in your head
produces overlaps, clipped labels, and crooked rows. The workflow that works: **anchor one
shape absolutely, place everything else relatively, let rects size themselves, and finish
with the arrangement verbs.**

1. Place the first shape with `--at` (anywhere sensible; `0,0` is fine).
2. Every subsequent shape hangs off an existing one: `--below`, `--right-of`, etc. Don't
   compute coordinates — name the neighbor.
3. Omit `--size` on labeled rects; the server fits the box to the label.
4. Connect with `add arrow --from <id> --to <id>` (bound arrows follow their shapes through
   every later adjustment).
5. Finish with `align` / `distribute` for rows and columns, `autosize` if a relabel outgrew
   its box, and `tidy` to square everything up.

## How it works

The canvas the **user** sees is a real tldraw editor in the browser. The **agent**, though,
doesn't need that tab open to draw: every `moi scratch` op except `view` runs against the disk
snapshot, either by parsing it (`read`) or by replaying it through a **headless tldraw store**
on the server (the mutations). Only `view` — rendering pixels — genuinely requires the browser.

- **Persistence.** `.moi/.scratchpad.json` holds a tldraw document snapshot (owned by moi — not
  hand-edited). The browser autosaves it ~500ms after you stop drawing; the server writes it
  after each agent mutation. Either writer publishes a "canvas updated" signal, and every open
  tab reloads from disk, so all viewers converge.
- **Reading** (`moi scratch read`, `read-image`) parses that snapshot straight off disk — the
  shape listing, or one image's bytes. No browser, no tldraw runtime.
- **Drawing** (`add`/`move`/`set`/`align`/`distribute`/`autosize`/`tidy`/`delete`/`clear`)
  runs on the server: it loads the snapshot
  into a headless `tldraw` store (`createTLStore` + the default shape/binding utils), applies
  the op as store records — using each shape's `getDefaultProps()` so records are schema-valid —
  writes the snapshot back, and nudges open tabs to reload. **No live tab required.** The store
  validates every record on `put`, so a malformed shape throws instead of corrupting the file.
  `add image` additionally resizes the file through `sharp` (the same dep the icon pipeline uses)
  before embedding it. (We drive the store, not an `Editor`, because the Editor needs a DOM + text
  measurement the server runtime doesn't have. See `server/scratchpad-executor.ts`.) Relative
  placement and the arrangement verbs resolve here too — only the server-side store can see an
  anchor's bounds — with text measured in the real canvas font (`server/scratchpad-metrics.ts`)
  and the geometry in `server/scratchpad-arrange.ts`.
- **Viewing** (`moi scratch view`) is the one op still relayed to a connected tab: only the
  browser can rasterize the canvas (`editor.toImageDataUrl`). With no tab showing **this**
  workspace's scratchpad it returns "No live canvas" — every other op still works off disk.
- **Each command targets its own workspace's canvas.** The CLI runs in a workspace directory,
  which resolves to that workspace; reads, writes, and the relayed `view` all key off that
  identity, so one workspace never touches another's canvas.
- **Concurrency is last-write-wins.** Now there are two writers — the browser and the server —
  each writing the whole snapshot. Server writes are serialized per workspace (load → mutate →
  save under a lock) and reload open tabs; a simultaneous user stroke and agent draw can still
  clobber one another, but edits are cheap and visible, so a lost change is easy to redo. No
  merging, no locking across the browser/server boundary.

> Earlier this worked differently: _all_ mutations were relayed to a live tab too, so the agent
> couldn't draw to a closed canvas. The write path moved server-side so drawing no longer
> depends on the user keeping the Scratchpad open.

## Building it

Lean on what's already here rather than inventing plumbing. The canvas is a `<Tldraw>` mounted
in the existing Scratchpad slot; add `tldraw` as a dep (pin a React-19-compatible version) and
load its CSS. The server side mirrors the widget pattern — a small disk module for
`.moi/.scratchpad.json` (like `layout.ts`), `GET`/`PUT` routes for the snapshot, the `moi scratch`
CLI hung off the control port next to `bundle`/`config`, and the existing MEI pub/sub for the
"canvas updated" nudge. Persist the snapshot's `document` only (drop the per-tab `session`), and
autosave off `store.listen({ source: 'user' })` so remote reloads don't echo. Build it in slices:
(1) canvas mounts, hydrates, and autosaves; (2) `read` parses the snapshot off disk; (3) `view`
plus the draw ops relay through a connected editor — the only genuinely new piece is correlating
a request to a browser and awaiting its reply. Everything before that is wiring existing parts
together.
