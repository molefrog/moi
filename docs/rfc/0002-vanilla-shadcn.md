# RFC 0002 — vanilla shadcn on a pre-wired workspace

> **Status: rejected on review** (config files in the workspace) — superseded by
> [RFC 0003](./0003-shadcn-engine.md).

**One-liner:** moi lays down the config the real shadcn CLI needs, pre-wired
for applets. The agent then uses the tool it was trained on — `bunx shadcn
add/search/docs` — with the full upstream catalog from day one.

## What the agent experiences

```
$ bunx shadcn add button popover        # or add @moi/dialog for overlays
$ bunx shadcn search @shadcn -q table   # discovery
$ bunx shadcn docs button               # docs + usage examples
```

The skill says: "shadcn is set up. Components install to `.moi/ui/`. Use
`@moi/*` for overlay components (dialog, popover, tooltip). Run `moi bundle`
after adding."

## What lands in the workspace

```
.moi/
  components.json   ← written by moi init: base-nova, tabler, ui → ./ui,
                      registries: @moi → local server
  tsconfig.json     ← CLI requirement (also gives the editor types)
  ui/
    button.tsx        (upstream base-nova file, verbatim)
    utils.ts
  package.json      ← moi scaffold adds @base-ui/react + cva up front
```

Two config files more than RFC 0001. Both are inert and committable; neither
is ever hand-edited.

## How it works

- `moi init` (or first use) scaffolds `components.json` + `tsconfig.json`
  pre-aimed at `.moi/ui/`, and adds the base deps to the manifest — because
  base-nova registry items declare no dependencies and assume init did this
  (verified).
- Overlay components come from a small `@moi` namespace served by the local
  moi server — same upstream files with the portal-container fix applied.
  Everything else comes straight from ui.shadcn.com.
- The synthetic Tailwind entry (shared foundation) makes upstream markup
  compile; tokens flow from the workspace theme as today.

## Why this option

- **Maximum agent legibility** — the exact CLI, commands, and file format
  agents already know; `search`/`docs`/`view` work out of the box.
- **Full catalog immediately**, including community registries and future
  upstream components, with no moi-side curation or maintenance.
- Least moi code: scaffold two files and serve a handful of `@moi` items;
  no installer to build.
- Keeps the door open to the shadcn ecosystem (presets, third-party
  registries) essentially for free.

## Costs and risks

- Breaks "no config files" — `components.json` and `tsconfig.json` land in
  `.moi/` for every workspace that touches components.
- Generated files import via the `@/` alias; the applet bundler currently
  resolves only relative paths. Needs verification that Bun's tsconfig-paths
  resolution covers it in `buildApplet` — if not, we're back to rewriting
  imports, which erodes the "vanilla" premise.
- Rebuilds aren't owned by anyone: after `shadcn add`, the agent must
  remember `moi bundle --force` (bare imports aren't staleness-tracked).
- Upstream defaults drift toward the same look everywhere — the vibe-code
  concern; DESIGN.md guidance has to carry more weight.

## Open questions

- Does Bun resolve `@/` via `.moi/tsconfig.json` inside `buildApplet`?
  (Decides feasibility — test first.)
- Scaffold config eagerly at init, or lazily on first component use to keep
  untouched workspaces clean?
- Can a rule reliably route agents to `@moi/*` for overlays, or do we
  shadow the default namespace entirely?
