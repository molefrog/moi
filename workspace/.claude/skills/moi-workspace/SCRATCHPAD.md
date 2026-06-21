# Scratchpad

The Scratchpad is the workspace's **shared whiteboard** — one freeform [tldraw](https://tldraw.dev)
canvas that the user draws on by hand and the agent drives through the `moi scratch` CLI. Same
canvas, two authors; disk is the source of truth. Use it to sketch, diagram, annotate the user's
drawing, or lay out boxes together.

You work the canvas through `moi scratch`, run from the workspace directory. It both **sees** and
**draws**.

## Seeing

- `moi scratch read` — dump the canvas as JSON: each shape's `id`, `type`, position, size, and
  text. Use this to reason about exact shapes — what's where, what to move, what to relabel. Served
  off disk, so it works whether or not a browser tab is open. Image shapes report a `src`, but
  base64 blobs come back as `base64:omitted` — call `view` to actually see them.
- `moi scratch view` — render the canvas to a PNG (prints the file path). Use this to _see_ what the
  user drew — freehand, layout, anything structure can't capture. Needs an open Scratchpad tab.

`read` is for logic; `view` is for vision.

## Drawing

```
moi scratch add text   --at <x,y> --text "..."           [--id NAME] [--color C] [--stroke W]
moi scratch add rect   --at <x,y> --size <w,h> [--text]   [--id NAME] [--color C] [--stroke W]
moi scratch add note   --at <x,y> --text "..."            [--id NAME] [--color C] [--stroke W]
moi scratch add arrow  --from <id|x,y> --to <id|x,y>      [--id NAME] [--color C] [--stroke W] [--elbow]
moi scratch move   <id> --to <x,y>
moi scratch set    <id> --text "..."        # relabel / edit a shape's text
moi scratch delete <id>
moi scratch clear                           # wipe the whole canvas
```

- **`--id`** gives a shape a stable handle so later commands can address it (`move`, `set`,
  `delete`, or as an arrow endpoint). Without it, the command prints the generated id.
- **Arrows connect shapes.** `add arrow --from box1 --to box2` binds the endpoints to those shapes,
  so the arrow follows when they move — the connector you want in a diagram. Endpoints can also be
  bare `x,y` points. Add `--elbow` for right-angle (squared) routing instead of a curved arc.
- **`--color`** is one of `black`, `red`, `yellow`, `green`, `blue`, `grey`, **or any hex** (e.g.
  `#4465e9`, snapped to the nearest of those six). **`--stroke`** is `small` or `large`. Omit
  either to keep the default.
- **`clear`** removes every shape at once.
- Coordinates are tldraw canvas space (origin top-left, y down).

## Keep parity with the user

Your toolset is deliberately the same surface the user has in the UI toolbar — the same six colors,
the same two stroke sizes, rectangles/notes/text/arrows. Don't reach for shapes or styles the user
can't pick by hand; neither side should be able to make something the other can't represent.

## How it works

Almost everything works **without the Scratchpad tab open** — the user can close it and you can
still draw. The disk snapshot (`.moi/scratchpad.json`) is the source of truth.

- **`read`** parses the saved snapshot straight off disk — no browser.
- **Drawing** (`add`/`move`/`set`/`delete`/`clear`) runs on the server against a headless tldraw
  store, writes the snapshot, and nudges any open tab to reload. No live tab needed.
- **`view`** is the one exception: rasterizing the canvas needs the browser, so it relays to a
  connected tab. With none showing **this** workspace's Scratchpad it reports "No live canvas" —
  ask the user to open the Scratchpad tab. Every other command still works off disk.
- Edits are **last-write-wins** between you and the user; a clobbered change is cheap to redo.
