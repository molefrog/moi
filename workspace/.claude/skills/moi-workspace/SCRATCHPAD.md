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
moi scratch add text   <pos> --text "..."                [--id NAME] [--color C] [--font-size S]
moi scratch add rect   <pos> [--size <w,h>] [--text]      [--id NAME] [--color C] [--fill F] [--font-size S]
moi scratch add note   <pos> --text "..."                 [--id NAME] [--color C] [--font-size S]
moi scratch add arrow  --from <id|x,y> --to <id|x,y>      [--id NAME] [--color C] [--stroke W] [--elbow]
moi scratch add image  <path>                             [--at <x,y>] [--id NAME] [--quality lo|hi]
moi scratch move   <id> --to <x,y>
moi scratch set    <id> --text "..."
moi scratch align      <id> <id> [...] --edge left|right|top|bottom|center-x|center-y [--to <id>]
moi scratch distribute <id> <id> <id> [...] --axis x|y [--gap N]
moi scratch autosize   <id> [...]
moi scratch tidy [--grid N]
moi scratch delete <id>
moi scratch clear
```

- `<pos>` is `--at <x,y>` **or a relative flag** — `--below <id>`, `--above <id>`,
  `--left-of <id>`, `--right-of <id>` — plus optional `--gap N` (distance from the anchor,
  default 48) and `--align start|center|end` (cross-axis, default `center`;
  `--below a --align start` = left edges flush). Exactly one of the two. The server resolves
  the anchor's real bounds, so relative placement lands exactly; arrows can't be anchors.
- Omit `rect --size` when the rect has `--text`: the server measures the label with the real
  canvas font and sizes the box so the text **never overflows**. Without text it defaults to
  160×96. Only pass `--size` for boxes that aren't label-driven (containers, frames).
- `align` lines shapes' chosen edge/center up with the anchor (`--to`, default the first
  listed), moving them only on that axis. `distribute` spaces shapes along an axis: with
  `--gap` it repacks at exactly that spacing (first shape stays put); without, first and last
  stay fixed and the in-between gaps equalize (needs ≥3 shapes). `autosize` re-fits labeled
  rects whose text outgrew them (e.g. after `set`), keeping each top-left. `tidy` cleans the
  whole canvas: snap positions to the grid (default 8px) and pull edges/centers within 10px of
  each other exactly together. All of these skip arrows — bound arrows follow their shapes.
- `--id` names a shape so later commands can address it (`move` / `set` / `delete`, the
  arrangement verbs, or as an arrow endpoint). Without it, the command prints the generated id.
- `add arrow --from box1 --to box2` binds endpoints to those shapes, so the arrow follows when
  they move. Endpoints can also be bare `x,y`. `--elbow` routes with right angles.
- `add image` resizes to fit the canvas — `--quality lo` (default) or `hi` for more pixels — so a
  huge file never gets embedded whole.
- `--color` is `black|red|yellow|green|blue|grey` or any hex (snapped to nearest). The other style
  flags mirror each shape's toolbar controls: `--fill` (rect) is `none|semi|pattern|solid`;
  `--font-size` (text, note, and a rect's label) is `regular|big`; `--stroke` (arrow) is
  `small|large`. You can only make what the user can make by hand.
- `--fill` picks how a rectangle's interior is painted (the outline is always the full `--color`):
  - `none` — transparent interior, just the colored outline. Reach for this to box/group other
    shapes without hiding them, or when the rect is a frame.
  - `semi` — a light, translucent wash of the color. Soft highlight; text and shapes underneath
    still read through it.
  - `pattern` — diagonal hatch lines in the color over a near-transparent interior. Reads as
    "marked / selected / special" without going fully opaque.
  - `solid` — fully opaque fill in the color (interior matches the outline). Use for solid blocks,
    legend keys, or a label chip; anything behind it is hidden.
  A rect's outline is always a rough (hand-drawn) stroke, matching what the toolbar draws. Default
  fill is `semi`; pass `--fill none` for an outline-only box or `--fill solid` for an opaque block.
- Coordinates are tldraw canvas space (origin top-left, y down).

## Laying out a diagram

**Never compute coordinates in your head** — guessed positions give overlapping boxes, clipped
labels, and crooked rows. Instead:

1. **Anchor** the first shape with `--at` (anywhere; `0,0` is fine).
2. **Place everything else relatively** — `--below`, `--right-of`, `--gap`, `--align` — naming
   the neighbor instead of doing arithmetic.
3. **Omit `--size`** on labeled rects so each box fits its text.
4. **Connect** with bound arrows (`--from <id> --to <id>`); they follow through every later move.
5. **Finish** with `align` / `distribute` to straighten rows, `autosize` if a relabel outgrew
   its box, and `tidy` to square the whole canvas up.

Worked example — "expose a Tailscale service under your domain":

```
# Anchor one node, chain the rest off it. No --size: boxes fit their labels.
moi scratch add rect --at 0,0 --text "Browser" --id browser
moi scratch add rect --right-of browser --gap 140 --text "reverse proxy — proxy.example.com, terminates TLS" --id proxy
moi scratch add rect --right-of proxy --gap 180 --text "web service on localhost:3000" --id service

# Straighten the row (the boxes are different heights), space it exactly, connect it.
moi scratch align browser proxy service --edge center-y
moi scratch distribute browser proxy service --axis x --gap 140
moi scratch add arrow --from browser --to proxy --elbow
moi scratch add arrow --from proxy --to service --elbow

# Private-network container: the one hand-sized box — read the service's bounds
# (`moi scratch read`) and draw around them with ~40px padding.
moi scratch add rect --at <sx-40>,<sy-40> --size <sw+80>,<sh+96> --fill none --color grey --id tailnet
moi scratch add text --below service --gap 24 --text "private tailnet" --color grey --id tailnet-label

# Title and side note hang off shapes too.
moi scratch add text --above browser --gap 64 --align start --font-size big --text "Expose a Tailscale service under your domain" --id title
moi scratch add note --below proxy --gap 96 --text "Cert via Let's Encrypt DNS-01 — no open ports needed" --id cert-note

# Finish: square the whole canvas up. Bound arrows follow on their own.
moi scratch tidy
```
