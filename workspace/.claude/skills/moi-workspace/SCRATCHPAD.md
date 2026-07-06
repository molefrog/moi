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
- `moi scratch view` — render the whole canvas to a PNG and print the file path. **Always
  works.** With a Scratchpad tab open you get the browser's exact pixels; without one the
  server renders a faithful approximation (same font, same layout, plainer strokes) and notes
  that on stderr. `--headless` forces the server renderer. Read the PNG to actually look at
  what you (or the user) drew.
- `moi scratch lint` — check the canvas geometry for what makes a drawing read as sloppy:
  - `text-overflow` (error) — a rect's label doesn't fit its box, measured with the real
    canvas font. The fix is an exact `resize`.
  - `overlap` (error) — two shapes collide (full containment counts as grouping and is fine).
  - `near-misalign` (warn) — edges or centers off by ≤10px; they were probably meant to align.
  - `uneven-gaps` (warn) — a row/column with inconsistent spacing.

  Every finding carries a ready-to-run fix command. `--json` for structured output. Advisory —
  it always exits 0; findings, not failures.

`read` is for logic; `view` / `read-image` are for vision; `lint` is for taste.

## The loop: draw, lint, look

Never draw blind and call it done. After laying out shapes:

1. **`moi scratch lint`** — fix **every error** (run the suggested fix commands; they're
   exact). Read the warnings and judge: a 4px misalignment is almost always a mistake, an
   uneven gap sometimes isn't.
2. **`moi scratch view`** — read the PNG and eyeball it like a human would: does anything
   overlap the title, crowd an edge, or float unanchored? Lint catches what geometry can
   measure; the picture catches the rest.
3. Adjust (`move` / `resize` / `set`) and re-check until lint is clean and the picture looks
   deliberate.

Sizing boxes: don't guess label widths. If lint flags `text-overflow`, apply its resize — it's
computed from the actual rendered font, so the label fits exactly.

## Drawing

```
moi scratch add text   --at <x,y> --text "..."           [--id NAME] [--color C] [--font-size S]
moi scratch add rect   --at <x,y> --size <w,h> [--text]   [--id NAME] [--color C] [--fill F] [--font-size S]
moi scratch add note   --at <x,y> --text "..."            [--id NAME] [--color C] [--font-size S]
moi scratch add arrow  --from <id|x,y> --to <id|x,y>      [--id NAME] [--color C] [--stroke W] [--elbow]
moi scratch add image  <path>                             [--at <x,y>] [--id NAME] [--quality lo|hi]
moi scratch move   <id> --to <x,y>
moi scratch resize <id> --size <w,h>   # rects & images only
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
- `resize` changes a rect's or image's size. Notes, text, and arrows size themselves — for a
  rect whose label doesn't fit, use the exact size a `lint` `text-overflow` finding suggests.
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
