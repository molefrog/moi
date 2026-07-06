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

## Drawing diagrams — `moi scratch diagram`

**For ANY boxes-and-arrows structure — architectures, flows, pipelines, "how X works" — use
`diagram`, never hand-placed primitives.** You declare nodes, groups, and edges; the server
measures every label with the real canvas font, sizes the boxes to fit, and computes the
layout with ELK. No overlaps, no clipped text, straight rows, even gaps — and you never
touch a coordinate. Hand-placing a multi-box diagram with `add rect` wastes turns and comes
out crooked.

```
moi scratch diagram [--spec file.json] [--at x,y] [--id prefix]
```

- No `--spec` reads stdin — pipe a heredoc (easiest).
- Omit `--at` and the diagram auto-places below whatever is already on the canvas.
- `--id` prefixes every created shape id: `<prefix>-<nodeId>`, `<prefix>-title`,
  `<prefix>-edge-<i>`. The ids are printed on success — use them with `move`/`set`/`delete`
  to adjust individual pieces afterwards.

A complete worked example:

```sh
moi scratch diagram --id tailscale <<'EOF'
{
  "title": "How to expose a Tailscale service",
  "direction": "right",
  "nodes": [
    { "id": "browser", "label": "Browser (internet)", "color": "blue" },
    { "id": "proxy", "label": "Reverse proxy (Caddy)\nterminates TLS, forwards to the tailnet", "color": "green", "width": 280 },
    { "id": "svc", "label": "Service\nlocalhost:3000" },
    { "id": "tip", "label": "MagicDNS gives every machine a stable name", "shape": "note", "color": "yellow" }
  ],
  "groups": [
    { "id": "tailnet", "label": "Tailscale network (private)", "color": "grey", "children": ["svc"] }
  ],
  "edges": [
    { "from": "browser", "to": "proxy", "label": "https://app.yourdomain.com", "color": "blue" },
    { "from": "proxy", "to": "svc", "label": "tailnet IP", "elbow": true }
  ]
}
EOF
```

The spec, field by field:

- `title` (optional) — big heading placed above the diagram.
- `direction` — main flow: `"right"` (default) or `"down"`.
- `nodes` — required, at least one. Each needs a unique `id` and a `label` (use `\n` for
  explicit line breaks; long labels wrap automatically). Optional: `shape` (`"rect"`
  default — sized to fit its label; `"note"` — a sticky, fixed 200×200, keep its text
  short), `color` and `fill` (same values as the CLI flags below), `width` (label
  wrap-width hint in px, default 260 — bump it for long one-line labels).
- `groups` (optional) — container rects drawn around their `children` (node ids, or other
  group ids for nesting). Rendered as an outline with the label at the top; edges may cross
  group boundaries freely.
- `edges` (optional) — arrows **bound** to their endpoint shapes (they follow if anything
  is moved later). `from`/`to` reference node or group ids; optional `label`, `color`, and
  `elbow: true` for right-angle routing.

Everything lands in one batch — either the whole diagram or nothing. Spec mistakes come
back as errors naming the exact entry (`edges[1]: unknown endpoint "svc2" ...`), so fix and
re-run. To regenerate a diagram, `delete` its shapes (you have the prefixed ids) and compile
again.

## Drawing primitives

For **annotations and one-offs** — a sticky note next to the user's sketch, one arrow, a
caption, an image — not for laying out diagrams (that's `diagram` above).

```
moi scratch add text   --at <x,y> --text "..."           [--id NAME] [--color C] [--font-size S]
moi scratch add rect   --at <x,y> --size <w,h> [--text]   [--id NAME] [--color C] [--fill F] [--font-size S]
moi scratch add note   --at <x,y> --text "..."            [--id NAME] [--color C] [--font-size S]
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
