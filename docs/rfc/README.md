# RFCs — shadcn components for applets

Two proposals for how agents get shadcn components in workspaces. Read both
(one page each), decide on a call. Evidence behind every claim:
`docs/shadcn-applet-experiments.md`.

**Shared foundation (ships in either case):**

1. Inline `tw-animate-css` + `shadcn/tailwind.css` into the applet's synthetic
   Tailwind entry — without it every shadcn idiom is silently dropped
   (verified, +11 KB, patch already on this branch).
2. Fix the missing `secondary` token in the host theme — secondary buttons
   render with no fill today, shadcn or not.
3. Components live in `.moi/ui/`, one fixed place; overlays must portal into
   the applet scope (Base UI `container` prop, fix verified in browser).
4. Skill guidance collapses to one file under `references/`; rules: always
   Base UI, tabler icons, tokens only. Nothing exists until first use.

**The actual decision — who owns the component source:**

|                      | 0001 blessed registry        | 0002 vanilla shadcn            |
| -------------------- | ---------------------------- | ------------------------------ |
| Agent runs           | `moi ui add button`          | `bunx shadcn add button`       |
| Config in workspace  | none                         | `components.json` + `tsconfig` |
| Catalog on day one   | ~15–20 curated               | full upstream + community      |
| Components look like | the host app (demo quality)  | upstream base-nova defaults    |
| Maintenance          | moi curates and updates      | upstream; moi serves overlays  |
| Portal fix delivered | baked into every component   | `@moi/*` namespace only        |
| Main risk            | catalog upkeep, no discovery | `@/` alias resolution, rebuild |

They compose: 0001 can add an upstream escape hatch later; 0002 can narrow
into 0001 by shadowing the default registry. Starting point differs — 0001
optimizes for self-contained and demo-quality output, 0002 for agent
familiarity and catalog breadth.
