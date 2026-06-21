# Scratchpad

The Scratchpad is the workspace's **shared whiteboard** — one freeform tldraw canvas the user
draws on by hand and you drive through `moi scratch`. Same canvas, two authors; disk is the
source of truth. Use it to sketch, diagram, annotate the user's drawing, or lay out boxes.

## Seeing

**Always inspect the canvas through the commands below — never open, `cat`, `read`, or parse the
snapshot file yourself.** The on-disk file (`.moi/.scratchpad.json`) is moi-internal: its schema is
tldraw's and shifts without notice, blobs are stripped, and `moi scratch read` already gives you the
clean, agent-friendly view. Treat it exactly like `.moi/.workspace.json` — CLI only.

- `moi scratch read` — dump the canvas as JSON: each shape's `id`, `type`, position, size, and
  text. Off disk, so it works whether or not a browser tab is open.
- `moi scratch read-image <id>` — save one image shape to a file (its actual bytes; `read` omits
  the blob). Off disk too.
- `moi scratch view` — render the whole canvas to a PNG. Needs an open Scratchpad tab.

`read` is for logic; `view` / `read-image` are for vision.

## Drawing

```
moi scratch add text   --at <x,y> --text "..."           [--id NAME] [--color C] [--stroke W]
moi scratch add rect   --at <x,y> --size <w,h> [--text]   [--id NAME] [--color C] [--stroke W]
moi scratch add note   --at <x,y> --text "..."            [--id NAME] [--color C] [--stroke W]
moi scratch add arrow  --from <id|x,y> --to <id|x,y>      [--id NAME] [--color C] [--stroke W] [--elbow]
moi scratch add image  <path>                             [--at <x,y>] [--id NAME] [--quality lo|hi]
moi scratch move   <id> --to <x,y>
moi scratch set    <id> --text "..."
moi scratch delete <id>
moi scratch clear
```

- `--id` names a shape so later commands can address it (`move` / `set` / `delete`, or as an
  arrow endpoint). Without it, the command prints the generated id.
- `add arrow --from box1 --to box2` binds endpoints to those shapes, so the arrow follows when
  they move. Endpoints can also be bare `x,y`. `--elbow` routes with right angles.
- `add image` resizes to fit the canvas — `--quality lo` (default) or `hi` for more pixels — so a
  huge file never gets embedded whole.
- `--color` is `black|red|yellow|green|blue|grey` or any hex (snapped to nearest); `--stroke` is
  `small|large`. These match the UI toolbar — you can only make what the user can make by hand.
- Coordinates are tldraw canvas space (origin top-left, y down).
