# Scratchpad visual design: making agent drawings look human-made

## The problem

The agent can drive the Scratchpad (`moi scratch`), but its diagrams don't look like a
person drew them: boxes overlap the title, labels overflow their rects mid-word
("localhost:30 00"), spacing is arbitrary, nothing lines up. Three root causes:

1. **No text measurement.** The agent guesses how big a label will render. The server
   builds shapes through a headless tldraw store with no DOM, so nothing can tell the
   agent "that label needs 232px". Overflow and cramped boxes follow.
2. **Absolute-coordinate thinking.** Every op takes raw `x,y`. LLMs are good at
   topology ("proxy sits between browser and service") and bad at the arithmetic that
   turns topology into aligned, evenly-spaced pixels.
3. **No feedback loop.** `moi scratch view` needs an open browser tab; without one the
   agent draws blind and never sees the mess it made. Even with a tab, "looks off" isn't
   machine-checkable.

Tools that solve this well (Graphviz, D2, Mermaid, draw.io's auto-arrange) all share the
same skeleton: _measure text → size nodes → run a real layout algorithm → render_. Humans
on whiteboards use a different skeleton: _rough placement → align/distribute/nudge until
it looks right_. Both beat "guess coordinates in your head".

## Shared foundation (this branch)

`server/scratchpad-metrics.ts` — text measurement with the **actual canvas font**
(Shantell Sans Informal from `@tldraw/assets`, version-matched to our tldraw, read by
`fontkit`): line widths, word wrap, and `fitRectToLabel` (the smallest grid-rounded rect
whose label fits, with tldraw's real padding and line height). Every approach below
builds on it; it kills the label-overflow class of bugs at the root.

## The three approach branches

Each is an independent bet, implemented end-to-end on its own branch off this one.
They're deliberately composable — the long-term ship is likely A+B+C merged.

### A — `…-a-autolayout`: declare the diagram, never touch a coordinate

`moi scratch diagram` takes a declarative spec (nodes, containers, labeled edges, a
title) and compiles it onto the canvas: labels are measured, nodes sized to fit, and
positions computed by **ELK** (`elkjs` — the layered/Sugiyama engine behind D2 and
Mermaid's ELK mode; handles nested containers and edge-label placement natively). The
agent describes _structure_; geometry is guaranteed non-overlapping, aligned, and evenly
spaced by construction.

- Bet: for the "draw me how X works" case — the bulk of agent drawing — the agent should
  never think in pixels at all.
- Limits: freeform annotation of the user's sketch isn't a graph; regenerating a diagram
  the user hand-tweaked can fight them.

### B — `…-b-relative-tools`: give the agent a designer's hand tools

Keeps the imperative model but removes the arithmetic: `add` gains relative placement
(`--below <id>`, `--right-of <id>`, `--gap`, `--align`), rect sizing becomes automatic
when `--size` is omitted (via `fitRectToLabel`), and new verbs `align`, `distribute`,
and `tidy` fix up whatever's there — the same align/distribute/snap commands every
design tool ships. Works equally for new drawings and for cleaning up around the user's
own shapes.

- Bet: the agent's topology instincts are fine; it just needs constraint-shaped verbs
  instead of a calculator.
- Limits: multi-step; the agent must still choose a sensible overall arrangement.

### C — `…-c-see-lint`: let the agent see, and lint what it can't see

Two feedback channels. `moi scratch view` gets a **server-side renderer** (our own
SVG emitter for the primitive shape set, rasterized by `resvg` with the real Shantell
Sans — no browser tab needed, cached woff2→ttf conversion via `wawoff2`), so the agent
can always look at the canvas. And `moi scratch lint` turns "looks off" into
machine-checkable findings: label overflow (measured, not guessed), shape overlaps,
almost-aligned edges, uneven gaps in rows/columns — each with a concrete suggested fix.
The skill teaches the loop: draw → lint → fix → view.

- Bet: feedback dominates tooling — an agent that can see and re-check converges on
  human-looking output no matter how it draws.
- Limits: iteration costs turns; lint heuristics need tuning to avoid nagging.

## How to compare when reviewing

Ask each branch to reproduce the "expose a Tailscale service under your domain" diagram
(the screenshot that motivated this work): a browser node, a proxy node with a long
multi-line label, a private-network container holding a service node, labeled arrows,
a title, and a side note. Judge: no overlaps, no clipped text, straight aligned rows,
consistent gaps — and how many agent turns it took to get there.
