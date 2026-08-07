# moi shadcn — spec

`moi shadcn` is an opinionated shadcn-lite proxy: one command driven by the
`shadcn` package's own programmatic engine, wrapped in moi's conventions.
Upstream registry as the source of truth, zero config files in the
workspace, Base UI only. The command writes source files; the agent owns
everything else.

Status: decided (Aug 2026). Every empirical claim below (build behavior,
registry mechanics, theming cascade) was verified by experiment; the full
research trail lives in PR #78.

## Opinions (non-negotiable)

- No config files in the workspace — no `components.json`, no
  `tsconfig.json`, ever. Both are CLI-layer artifacts; the engine takes its
  config as an in-memory object that lives inside moi.
- Always and only Base UI primitives. Tabler icons. Workspace tokens —
  never hardcoded colors.
- Components live in `.moi/ui/`, one fixed place, created on first use.
- Applets import them relatively: `../ui/button`. Never `@/` aliases (the
  skill states this; unresolved imports already fail loudly at build).
- No moi-hosted registry. `add` goes straight to the shadcn registry;
  offline is unsupported for now.
- The command is deliberately not smart: it never installs dependencies,
  never rebuilds, never edits existing files.

## Command surface

V1:

- `moi shadcn add <name…>` — fetches items, applies moi transforms, writes
  files to `.moi/ui/`. If a target file exists, **fails** with a message
  naming the `--force` flag; hand-customized components are never silently
  overwritten. Ends by printing next steps, not performing them:
  "Component added. Make sure dependencies are installed, then rebuild."
- `moi shadcn docs <name>` — official docs fetched as markdown
  (`ui.shadcn.com/docs/components/base/<name>.md` serves raw markdown;
  Base UI API references likewise) for the agent to read.
- `moi shadcn list [-q term]` — installed components + the upstream
  catalog, fuzzy search over the registry index.

Later: `example <name>` (registry usage-source items, ~32 KB of real
composition code — for an agent about to build UI, higher value than
docs) and `diff [name]` (installed file vs upstream; pairs with the
no-overwrite rule as the update story).

Never: `init` (moi is init), `build`/`registry` (registry publishing),
`mcp`, `eject` (absorbed into the applet build), presets, migrations,
config management.

## What `add` does, exactly

1. `getRegistryItems(names, { config })` via the pinned `shadcn` package —
   the config is a ~10-line object literal inside moi (style `base-nova`,
   `iconLibrary: 'tabler'`); `registryDependencies` resolve recursively.
2. `transformIcons` (shadcn's own, ts-morph): registry content ships
   `<IconPlaceholder lucide="…" tabler="…"/>`; the transform picks the
   tabler attribute and writes the `@tabler/icons-react` import. lucide
   never enters the workspace.
3. Import rewrite to relative paths (two string maps:
   `@/registry/<style>/lib/utils` → `./utils`, `…/ui/<x>` → `./<x>`).
   There is no config knob for this: raw registry content hardcodes
   `@/registry/<style>/…` paths, the CLI's alias rewrite is internal (not
   exported), and aliases are validated against tsconfig paths or
   `package.json` `imports` — a relative value like `./utils` is rejected
   outright (verified). Implementation: rewrite on the same ts-morph
   `SourceFile` already built for `transformIcons` (walk import and
   export declarations, `setModuleSpecifier`) — AST-accurate, catches
   re-exports, and adds no dependency since ts-morph ships with the
   pinned `shadcn` package.
4. Write files to `.moi/ui/`. On first add, also install `ui/utils.ts`
   (`cn` — itself a registry item; declares `clsx` + `tailwind-merge`).
5. Print next steps. Nothing else — no install, no rebuild.

## Dependencies

- `moi init` pre-seeds the applet manifest with `@base-ui/react`,
  `class-variance-authority`, `clsx`, `tailwind-merge` — one install at
  workspace creation covers the common path (base-nova registry items
  declare no npm deps; upstream assumes init handled them).
- The command never installs. The skill makes installation the agent's
  job, prompted by `add`'s output.
- Old workspaces (scaffolded before the pre-seed) are covered by the same
  fallback: the skill lists the required deps, a failing build is the
  signal, the agent adds them. Pre-seeding is the ideal path, not a
  requirement.

## Workspace layout and skill wiring

```
.moi/
  ui/                     ← created on first add, never before
    button.tsx
    utils.ts              ← cn; auto-installed on first add
  widgets/tracker.tsx     ← import { Button } from '../ui/button'
  package.json            ← base deps pre-seeded at init

<skills dir>/moi-workspace/
  SKILL.md                ← two lines: "need a standard control?
                            moi shadcn add <name>, import from ../ui/"
  references/shadcn.md    ← one-file essentials
```

`references/shadcn.md` is a one-file compilation condensed from the
official shadcn skill (`bunx --bun skills add shadcn/ui`): usage,
composition, customization, per-kind rules. Stripped: MCP, init, package
runners, Vite/Router, project introspection — extraction is mandatory,
not cosmetic (the official skill's first move, `shadcn info`, requires
`components.json`). Updated manually when the pinned shadcn version
bumps; a scripted re-derivation remains an option if that gets tiresome.

## Build integration: the synthetic Tailwind patch (prerequisite)

Every applet build starts from a CSS entry moi generates
(`writeSyntheticTailwindCss` → `.moi/.build/<kind>-tailwind.css`):
`@import 'tailwindcss'` + `client/theme.css` text-inlined + the dark
variant + `@source`. Tailwind v4 emits only utilities it knows — and the
shadcn vocabulary (`data-open:` variants, `animate-in`, accordion
keyframes, `scroll-fade`, `no-scrollbar`) is defined in `tw-animate-css`
and `shadcn/tailwind.css`, which the host imports but the synthetic entry
does not. Unknown class → silently dropped; components render
half-styled with no error.

The patch: text-inline both files into the generated entry, read from
moi's own `node_modules` (the `HOST_THEME_PATH` pattern — the workspace
gains no files and no deps; exactly the css the base-nova style item
declares, and what `shadcn eject` inlines into a normal app). Measured:
+11 KB, emission usage-driven, scoping intact, all 54 build tests green.
Ships together with the token-vocabulary fixes below.

## Theming and inheritance

Measured on a real compiled widget bundle: **every paint property flows
through host-inherited semantic tokens** (`primary`, `background`,
`muted`, `destructive`, `border`, `input`, `ring` + foregrounds,
`--radius`, `--sans`/`--mono`); the only hardcoded literals are
transparent. Bundle-local vars are structural Tailwind mechanics
(`--spacing`, `--text-*`, `--tw-*`). Values resolve at runtime, so theme
changes never require a rebuild, and the theme travels with the
workspace (committable config).

`moi theme` sets 9 inline vars on `documentElement` (fonts + 7 colors
derived from one primary). Against the shadcn vocabulary this splits
into tiers: 7 directly themed, 3 following indirectly via
`var(--foreground)` chains (`card/popover/accent-foreground`), and the
rest stuck at neutral `:root` defaults (`card`, `popover`, `border`,
`input`, `ring`, `destructive`, `--radius`, shadows). `secondary` and
`chart-1…5` are missing entirely — `secondary` is a live host bug
(secondary buttons render with no fill today).

Verified live: **workspace color themes never reach widgets** — the
frame's forced `.dark` class redefines every color token with neutral
constants closer in the cascade than the theme's `documentElement`
props; only fonts pass through. This is the root cause of the
"black-and-white widgets" feedback.

Foundation work implied (hue vs. mode separation):

- Extend derivations to the stuck-neutral tier (`card`, `popover`,
  `border`, `input`, `ring` derive from primary like `muted` does).
- Add `secondary` + `chart-1…5` to `theme.css`, `:root`/`.dark`, and the
  derivations.
- Derive a **dark value set** from the same primary, applied under
  `.dark` (injected rule or `light-dark()` + `color-scheme`) — widgets
  keep the dark-surface signature but adopt the workspace hue.

Customization hierarchy (cheapest first): workspace theme (tokens) →
edit files in `.moi/ui/` (propagates everywhere; protected by the
no-overwrite rule) → `className` at the callsite (merges correctly via
`cn`/`tailwind-merge`). Agents never write `dark:` overrides; installed
components may contain them (upstream design, compiles fine).

## Pinning and upgrades

moi pins the `shadcn` package to an exact version (no `^`). The engine
functions are public exports, but upstream makes no API-stability
promise for them, and registry content can run ahead of the published
package (live components already use a `cn-rtl-flip` utility no
published `tailwind.css` defines — cosmetic, RTL-only). Upgrades are
deliberate: bump, run smoke tests (fetch → transform → write a known
item), refresh `references/shadcn.md`, ship.

## Open items

- **Portals/overlays — parked for a dedicated review.** Overlay
  components portal to `document.body`, escape the applet's scoped CSS,
  and half-work on accidentally borrowed host styles (verified: light
  popup over a force-dark widget). Proven fix exists (Base UI's public
  `container` prop → applet scope). Options: codemod inside `add`,
  pre-patched copies of the overlay trio, or a portal host exposed by
  the applet runtime.
- Per-kind component rules for `references/shadcn.md` (`sheet`,
  `navigation-menu`, page chrome: views yes, widgets no) — list TBD.
- `docs` output shape: links vs. fetched markdown (recommendation:
  markdown).

## Ship plan

1. **Foundation** — synthetic-Tailwind inline, token vocabulary
   (`secondary`, `chart-*`, stuck-neutral derivations, dark set),
   scaffold dep pre-seed. Decision-independent; patches tested.
2. **`moi shadcn` v1** — `add` / `docs` / `list` over the pinned engine;
   prints next steps, does nothing else; smoke tests.
3. **Skill** — SKILL.md pointer + `references/shadcn.md`, including the
   install/rebuild responsibility and the relative-import rule.
