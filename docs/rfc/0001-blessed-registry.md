# RFC 0001 — `moi ui add`: a blessed component registry

> **Status: rejected on review** (moi-curated registry to maintain) — superseded by
> [RFC 0003](./0003-shadcn-engine.md).

**One-liner:** moi ships its own curated set of shadcn-format components and a
single command to install them. The shadcn CLI never runs in the workspace;
zero config files appear.

## What the agent experiences

```
$ moi ui add button popover
  added .moi/ui/button.tsx, .moi/ui/popover.tsx (+ ui/utils.ts, deps, rebuild)
```

```tsx
// .moi/widgets/tracker.tsx
import { Button } from '../ui/button'
```

The skill says one thing: _"Need a standard control? `moi ui add <name>`,
import it from `../ui/`. List with `moi ui list`."_

## What lands in the workspace

```
.moi/
  ui/               ← only appears on first `moi ui add`
    button.tsx        (Base UI + tabler + workspace tokens, portal fix baked in)
    utils.ts          (cn = clsx + tailwind-merge)
  package.json      ← deps merged in (@base-ui/react, cva…)
```

No `components.json`, no `tsconfig.json`, no init step. A workspace that never
uses components looks exactly like today. Passes the "agent runs `ls` and gets
it" test.

## How it works

- Registry items (plain shadcn registry-item JSON) live **inside the moi
  package**, curated from the host's own `client/components/ui` set: Base UI
  primitives, tabler icons, relative imports, `cn` from `./utils`, and the
  portal-container fix for overlays already applied.
- `moi ui add` reads the item, writes files to `.moi/ui/`, merges declared
  deps into `.moi/package.json`, runs `bun install`, and force-rebuilds
  affected applets (bare-import changes aren't tracked by the staleness walk,
  so the command owning the rebuild matters).
- Customization stays the agreed model: edit the file in `.moi/ui/` and it
  propagates; tokens keep flowing from the workspace theme.

## Why this option

- **Zero workspace footprint** — the strongest version of "moi is
  self-contained" and the Rails convention: one command, one folder.
- **"How do I make it look like yours"** is answered literally — the installed
  components _are_ the host's, so demo-quality is the default.
- No vibe-code risk from upstream defaults; nothing enters the workspace that
  moi didn't bless.
- Verified: local registry items install with deps today; the portal fix works
  (see `docs/shadcn-applet-experiments.md`).

## Costs and risks

- moi maintains the catalog: ~15–20 components to adapt once, then keep
  updated through the existing skill-update mechanism.
- No upstream catalog on day one — a component we didn't curate isn't
  available until we add it (mitigation: an `--from @shadcn` escape hatch that
  fetches upstream and applies the same adaptations, can ship later).
- Agents know `npx shadcn`, not `moi ui` — the skill must carry the mapping
  (one line; agents follow tool instructions well).

## Open questions

- Serve items from the local server (`/api/registry/{name}.json`) so outside
  tools can also consume them, or read straight from the package?
- Does `moi ui add` update existing components on skill update, or are
  installed files frozen until the agent edits them?
