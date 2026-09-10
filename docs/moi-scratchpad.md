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

The agent works through the Scratchpad's built-in tools. Discover them with
`moi tools scratchpad`, then call one with `moi call scratchpad <tool> '<args>'`.

### Seeing

- `moi call scratchpad read_canvas` — dump the canvas as **structured JSON**: each shape with its `id`,
  `type`, position, size, and text. Use this to reason about exact shapes — what's where,
  what to move, what to relabel. Works whether or not a browser tab is open. Image shapes
  carry a `src` — an `asset:` file reference or an https URL; the pixels never appear in
  the JSON (a legacy inline blob is reported as `base64:omitted`), so use `read_image` or
  `render_canvas` to actually see them.
- `moi call scratchpad read_image '{"id":"photo"}'` — save a single image shape's bytes to
  a file and return its path. Served off disk, like `read_canvas`; this is how the agent pulls
  the pixels behind a reference. A remote (`http`) asset returns its URL instead.
- `moi call scratchpad render_canvas` — render the **whole canvas** to a **PNG** and return
  its path. Use this to actually _see_ what the user drew (freehand, layout, anything
  structure can't capture).

`read_canvas` is for logic; `render_canvas` and `read_image` are for vision.

### Drawing

The agent doesn't emit raw tldraw records. Scratchpad tools expose a small **primitive layer**
that maps onto tldraw's own shape API — friendly to drive and stable against tldraw's
internal schema:

```sh
moi call scratchpad add_text       '{"x":40,"y":40,"text":"...","id":"label"}'
moi call scratchpad add_rectangle  '{"x":40,"y":100,"width":240,"height":120,"text":"...","id":"box"}'
moi call scratchpad add_note       '{"x":320,"y":100,"text":"...","id":"note"}'
moi call scratchpad add_arrow      '{"from":"box","to":"note","id":"link","elbow":true}'
moi call scratchpad add_image      '{"path":"./image.png","x":40,"y":260,"id":"image"}'
moi call scratchpad move_shape     '{"id":"box","x":80,"y":120}'
moi call scratchpad set_shape_text '{"id":"box","text":"New label"}'
moi call scratchpad delete_shape   '{"id":"box"}'
moi call scratchpad clear_canvas
```

- `id` gives a shape a stable handle so later tools can address it; otherwise the tool returns
  a generated id.
- String `from` and `to` values bind an arrow to shapes, so the arrow **follows** when the
  shapes move. `{ "x": 10, "y": 20 }` creates a free endpoint. Set `elbow` to `true` for
  right-angle (squared) routing instead of the default curved arc.
- `color` takes one of the **six palette names the UI toolbar offers** — `black`, `red`,
  `yellow`, `green`, `blue`, `grey` — **or any hex** (e.g. `#4465e9`), which is snapped to the
  nearest of those six (tldraw shapes only hold palette colors). The remaining style flags differ
  per shape, mirroring that shape's toolbar controls: `fill` (rectangle) is
  `none|semi|pattern|solid` and defaults to `semi`; `fontSize` (text, note, and a rectangle's
  label) is `regular|big`; `stroke` (arrow) is the line
  weight, `small` or `large`. Omit the size/stroke flags to keep tldraw's default. The agent's
  options deliberately match what the user can pick by hand — neither surface can make something
  the other can't.
- `add_image` adds a local image file. The server **resizes it to fit the canvas** —
  `quality: "lo"` (default, long side ≤768px) or `"hi"` (≤2048px) — re-encoding to WebP so a 10MB
  paste never lands on the canvas whole. `lo` is well within Claude's vision budget; reach for
  `hi` only when fine detail (e.g. screenshot text) matters. EXIF orientation is baked in;
  images are never enlarged. The bytes are stored as an asset file beside the snapshot (see
  Persistence below), never inlined into it.
- `clear_canvas` deletes every shape on the canvas in one shot.
- Coordinates are tldraw canvas space (origin top-left, y down).

The set is deliberately small — text, rectangle, note, arrow (with color plus each shape's
fill/font-size/stroke), plus
move/set/delete/clear. Enough to lay out a diagram or annotate the user's drawing; not a full
tldraw API.

## How it works

The canvas the **user** sees is a real tldraw editor in the browser. The **agent**, though,
doesn't need that tab open to draw: every Scratchpad tool except `render_canvas` runs against the
disk snapshot, either by parsing it (`read_canvas`) or by replaying it through a **headless tldraw
store** on the server (the mutations). Only `render_canvas` genuinely requires the browser.

- **Persistence.** `.moi/.scratchpad.json` holds a tldraw document snapshot (owned by moi — not
  hand-edited). The browser autosaves it ~500ms after you stop drawing; the server writes it
  after each agent mutation. Either writer publishes a "canvas updated" signal, and every open
  tab reloads from disk, so all viewers converge.
- **Image bytes live outside the snapshot.** Pasted/dropped/agent-added images are
  content-addressed files in `.moi/.scratchpad/` (`asset-<sha256>.<ext>` — a hidden sidecar
  dir next to the snapshot, moi-internal like the snapshot itself), referenced from asset
  records by `asset:` srcs — one of tldraw's native src protocols. The browser uploads
  via a custom `TLAssetStore` (POST `/scratchpad/assets`, resolved back through GET); the
  server writes files directly. This keeps the constantly-rewritten JSON small: without it,
  every autosave and every tab reload would re-serialize and re-ship megabytes of base64.
  Old workspaces with inline base64 images keep working — they render and `read_image`
  as-is; every save extracts any inline base64 it finds (legacy snapshots migrate on their
  next save; a stale tab PUTting blobs converges on the same files by content address) and
  then sweeps asset files that no shape in the document still uses (deleting an image in the
  browser removes only the shape — tldraw leaves the asset record behind, so the sweep keys
  on shape usage, not bare asset records) and the `.bak` backup doesn't reference, with
  a grace window so a just-uploaded file survives until its autosave lands. A periodic
  background pass re-sweeps every workspace, so orphans are reclaimed even when that save
  was the last edit — deleting an image and walking away still frees its file a few
  minutes later. If a referenced
  file does go missing (say the snapshot was copied without its sidecar dir), nothing
  breaks loudly: the canvas shows a broken-image placeholder, `read_canvas` flags the shape with
  `missing: true`, and `read_image` errors naming the expected location — move the `.moi`
  directory as a whole and the references heal, since file names are content-addressed.
- **Reading** (`read_canvas`, `read_image`) parses that snapshot straight off disk — the
  shape listing, or one image's bytes. No browser, no tldraw runtime.
- **Drawing** (`add`/`move`/`set`/`delete`/`clear`) runs on the server: it loads the snapshot
  into a headless tldraw store (`@tldraw/store` + the default schema from `@tldraw/tlschema`),
  applies the op as store records — using a copy of each shape's `getDefaultProps()` so records
  are schema-valid — writes the snapshot back, and nudges open tabs to reload. **No live tab
  required.** The store validates every record on `put`, so a malformed shape throws instead of
  corrupting the file. `add_image` additionally resizes the file through `sharp` (the same dep
  the icon pipeline uses) before embedding it. (We drive the store, not an `Editor`, because the
  Editor needs a DOM + text measurement the server runtime doesn't have. See
  `server/scratchpad-executor.ts`.)
- **The server never imports the `tldraw` package itself** — only its React-free sub-packages.
  The `tldraw` entry point evaluates the whole React editor, and `react-dom` 19.2+ throws at
  load time whenever the `react` it resolves is a different version. That is a live hazard for
  a global `bun i -g` install: every global package shares one hoisted `node_modules`, so moi's
  `react-dom` can land next to a `react` some other global package locked earlier, and the
  server then died at `moi start` before serving a request. The browser gets React from moi's
  own vendored ESM (`client/vendor/react`), so nothing outside the browser needs it.
  `server/test/server-react-free.test.ts` keeps it that way (a static import scan of
  `server/` + `lib/`, plus a runtime check that loading the writer pulls in no React module);
  `server/scratchpad-shape-defaults.ts` holds the copied defaults, pinned to the real shape
  utils by a test.
- **Viewing** (`render_canvas`) is the one operation still relayed to a connected tab: only the
  browser can rasterize the canvas (`editor.toImageDataUrl`). With no tab showing **this**
  workspace's scratchpad it returns "No live canvas" — every other op still works off disk.
- **Each tool call targets its own workspace's canvas.** The CLI runs in a workspace directory,
  which resolves to that workspace; reads, writes, and the relayed render all key off that
  identity, so one workspace never touches another's canvas.
- **Concurrency is last-write-wins.** Now there are two writers — the browser and the server —
  each writing the whole snapshot. Server writes are serialized per workspace (load → mutate →
  save under a lock) and reload open tabs; a simultaneous user stroke and agent draw can still
  clobber one another, but edits are cheap and visible, so a lost change is easy to redo. No
  merging, no locking across the browser/server boundary.

> Earlier this worked differently: _all_ mutations were relayed to a live tab too, so the agent
> couldn't draw to a closed canvas. The write path moved server-side so drawing no longer
> depends on the user keeping the Scratchpad open.

## Version skew

The snapshot embeds the serialized tldraw schema of whatever process last **wrote** it, and
tldraw migrates **forward only** — there are no down-migrations. So `.moi/.scratchpad.json`
is readable only by tldraw versions ≥ the writer's; a canvas touched by a newer moi will not
open in an older one. That's the invariant everything below defends.

- **tldraw is pinned exactly** in `package.json` (no `^`/`~` range), and a test
  (`server/test/tldraw-pin.test.ts`) keeps it that way. The client is prebuilt into `dist/`
  at publish time with the publisher's `node_modules`, but with a range the server's tldraw
  would resolve at **install** time — one published version could then ship a client older
  than its own server, which writes snapshots that client can't read. The pin also keeps
  side-by-side installs (global package vs repo checkout) on the same schema as long as
  they're the same moi version.
- **`@tldraw/store`, `@tldraw/tlschema`, and `@tldraw/utils` are pinned to the same exact
  version** as `tldraw` (the same test checks). They are the schema the server writes;
  `tldraw` is the schema the browser reads — and a test asserts the two serialize
  identically, so a server save never registers as a schema change in the browser.
- **Bumping tldraw is a deliberate act**: change all four pins together, `bun install`, test
  (the defaults and schema-parity tests catch what changed), and release-note that canvases
  touched by the new version won't open in older moi.
- **Every save is stamped** with the writer (`{ writer: { moi, tldraw } }` next to
  `document`), so when an older moi does hit a newer file, the error can name the version
  it needs. Deliberate downgrades and branch-hopping can't be prevented — only made loud,
  actionable, and non-destructive: the server's headless ops fail with a message saying
  which moi wrote the file and how to update (instead of tldraw's bare `migration-error`),
  and the browser shows a read-only notice _without mounting the editor_ — never tldraw's
  crash screen with its destructive "Reset data" button, and with no editor mounted the
  stale tab can't autosave over the newer file. `read_canvas` and `read_image` parse the
  raw JSON without migration, so the agent can still see the canvas under skew. The first
  save after a schema change also keeps the previous file as `.scratchpad.json.bak` — the
  manual escape hatch after a downgrade. Detection lives in `lib/scratchpad-skew.ts`.

## Implementation

The host-owned catalog lives beside the Scratchpad executor and plugs into the same target resolver
as view tools. Reads parse `.moi/.scratchpad.json`; mutations use the headless tldraw store;
`render_canvas` relays to the mounted editor and materializes its PNG on the server. The active
Scratchpad registers this same server catalog through WebMCP. The CLI and browser therefore share
the descriptors, validation, handlers, and results.
