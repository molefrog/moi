# Scratchpad

Scratchpad is the workspace's shared tldraw canvas. The user draws on it by hand and you work
through the built-in `scratchpad` tools. Use it to sketch, diagram, annotate the user's drawing, or
lay out boxes.

Discover the current catalog before using it:

```sh
moi tools scratchpad
```

Never open, parse, or edit `.moi/.scratchpad.json` or `.moi/.scratchpad/` directly. Their format is
internal. The tools provide the stable contract.

## Choose the right read

- `moi call scratchpad read_canvas` returns structured shape data. Use it to identify IDs, text,
  types, coordinates and sizes. It works with Scratchpad closed.
- `moi call scratchpad read_image '{"id":"photo"}'` materializes one image shape and returns an
  absolute path. A remote image returns its URL. Use `outputPath` when you need a specific local
  destination.
- `moi call scratchpad render_canvas` renders the whole canvas to a PNG and returns an absolute
  path. It requires an open Scratchpad tab. Use `outputPath` to choose the destination.

Use `read_canvas` for exact structure. Use `read_image` or `render_canvas` when pixels or freehand
content matter.

## Draw and edit

Pass one JSON object after the tool name:

```sh
moi call scratchpad add_text \
  '{"x":40,"y":40,"text":"Label","id":"label"}'
moi call scratchpad add_rectangle \
  '{"x":40,"y":100,"width":240,"height":120,"text":"API","id":"api"}'
moi call scratchpad add_note \
  '{"x":320,"y":100,"text":"Check auth","id":"note"}'
moi call scratchpad add_arrow \
  '{"from":"api","to":"note","id":"link","elbow":true}'
moi call scratchpad add_image \
  '{"path":"./diagram.png","x":40,"y":260,"id":"diagram"}'
moi call scratchpad move_shape '{"id":"api","x":80,"y":120}'
moi call scratchpad set_shape_text '{"id":"api","text":"Public API"}'
moi call scratchpad delete_shape '{"id":"note"}'
moi call scratchpad clear_canvas
```

Add tools accept an optional `id` and return `{ "id": "..." }`. When omitted, moi generates a
stable ID. Use IDs with `move_shape`, `set_shape_text`, `delete_shape`, and arrow endpoints.

`from` and `to` accept a shape ID or `{ "x": number, "y": number }`. Shape IDs bind the arrow to
those shapes so it follows when they move. Set `elbow` to `true` for right-angle routing.

Coordinates use tldraw canvas space: the origin is top-left and y increases downward. Relative
input and output paths resolve from the workspace root.

## Styles and images

- `color`: `black`, `red`, `yellow`, `green`, `blue`, `grey`, or a hex color. Hex values snap to
  the nearest Scratchpad palette color.
- `fill` on rectangles: `none`, `semi`, `pattern`, or `solid`. It defaults to `semi`.
- `fontSize` on text, notes and rectangle labels: `regular` or `big`.
- `stroke` on arrows: `small` or `large`.
- `quality` on images: `lo` or `hi`. It defaults to `lo`; use `hi` when small text or fine detail
  matters.

`add_image` resizes and re-encodes local images before storing them. The tool accepts a path from
the workspace root. `read_image` returns remote image URLs unchanged instead of downloading them.

## Runtime behavior

Every Scratchpad tool is reported as a server tool. Reads and mutations work against the persisted
canvas without an open browser. `render_canvas` relays to the mounted editor and returns the
current `No live canvas` error when Scratchpad is closed.

Tool calls perform real changes immediately. Read the canvas before retrying a mutation after a
timeout or disconnect. The user and server can write at the same time, and persistence is
last-write-wins.
