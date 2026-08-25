# moi ui-components — spec

`moi ui-components` (né `moi shadcn`) is an opinionated shadcn-lite proxy:
one command driven by the `shadcn` package's own programmatic engine,
wrapped in moi's conventions. Upstream registry as the source of truth,
zero config files in the workspace, Base UI only. The command writes source
files; the agent owns everything else.

Status: shipped (Aug 2026) — `server/ui-components.ts` (engine),
`server/cli-ui-components.ts` (CLI), the synthetic-Tailwind vocabulary
inline in `server/bundler/build-applet.ts`, and the
`references/UI-COMPONENTS.md` cheat sheet in the moi-workspace skill.
Every empirical claim below (build behavior, registry mechanics, theming
cascade) was verified by experiment; the research trail lives in PR #78,
with two revisions from the component review (Aug 20): the command name,
and a curated subset instead of the full upstream catalog.

## Opinions (non-negotiable)

- No config files in the workspace — no `components.json`, no
  `tsconfig.json`, ever. Both are CLI-layer artifacts; the engine takes its
  config as an in-memory object that lives inside moi.
- Always and only Base UI primitives. Tabler icons. Workspace tokens —
  never hardcoded colors.
- **A curated subset, not the catalog** (component review, Aug 2026): 40
  entries — the everyday controls plus `attachment`, `bubble`, `chart`,
  `data-table` and `date-picker` as patterns — and deliberately no
  page-scale chrome (`sidebar`, `navigation-menu`, `sheet`, `menubar`,
  `sonner`, `command`) and no `breadcrumb`/`input-otp` (cut in review).
  The list is `UI_COMPONENTS` in `server/ui-components.ts`; registry
  dependencies of a curated item (`separator`, `card`, `toggle`) install
  implicitly as support files.
- Components live in `.moi/ui/`, one fixed place, created on first use.
- Applets import them relatively: `../ui/button`. Never `@/` aliases (the
  skill states this; unresolved imports already fail loudly at build).
- No moi-hosted registry. `add` goes straight to the shadcn registry;
  offline is unsupported for now.
- The command is deliberately not smart: it never rebuilds, never edits
  existing files, and installs dependencies only on explicit `--install`.

## Command surface

V1 (shipped):

- `moi ui-components add <name…> [--force] [--install]` — fetches items
  (any number of names in one call), applies moi transforms, writes
  files to `.moi/ui/`. A **requested** file that exists is **skipped and
  reported** with a hint naming the `--force` flag, so a bulk add still
  installs everything new; only when _every_ requested component already
  exists does the add fail. Hand-customized components are never
  silently overwritten (existing support files — utils, applet-portal,
  riding-along registry deps — are kept, never overwritten, even under
  `--force`). Ends by printing next steps, not performing them: install
  these deps, import relatively, `moi bundle`. `--install` is the one
  opt-in exception: it runs the `bun install` in `.moi/` itself (also
  materializing the pre-seeded baseline in older workspaces);
  rebuilding stays the agent's job.
- `moi ui-components docs <name…>` — official docs fetched as markdown
  (`ui.shadcn.com/docs/components/base/<name>.md` serves raw markdown;
  works for the `data-table`/`date-picker` pattern pages too).
- `moi ui-components` / `list [-q term]` — the curated catalog with
  installed state; `-q` filters by name/description.

Later: `example <name>` (registry usage-source items, ~32 KB of real
composition code — for an agent about to build UI, higher value than
docs) and `diff [name]` (installed file vs upstream; pairs with the
no-overwrite rule as the update story).

Never: `init` (moi is init), `build`/`registry` (registry publishing),
`mcp`, `eject` (absorbed into the applet build), presets, migrations,
config management.

## What `add` does, exactly

1. Validates names against the curated catalog (typos get suggestions),
   expands patterns (`date-picker` → `calendar` + `popover` + `button`,
   `data-table` → `table` + a note about `@tanstack/react-table`).
2. `getRegistryItems(names, { config })` via the pinned `shadcn` package —
   the config is a ~10-line object literal inside moi (style `base-nova`,
   `iconLibrary: 'tabler'`); `registryDependencies` are closed
   transitively by the engine (`fetchUiComponents`), `utils` always rides
   along.
3. `transformIcons` (shadcn's own, ts-morph): registry content ships
   `<IconPlaceholder lucide="…" tabler="…"/>`; the transform picks the
   tabler attribute and writes the `@tabler/icons-react` import. lucide
   never enters the workspace. `transformMenu` (also shadcn's own) settles
   the `cn-menu-*` classes for the default menu color.
4. Import rewrite to relative paths (`@/registry/<style>/{lib,ui,hooks}/<x>`
   → `./<x>`). There is no config knob for this: raw registry content
   hardcodes `@/registry/<style>/…` paths, the CLI's alias rewrite is
   internal (not exported), and aliases are validated against tsconfig
   paths or `package.json` `imports` — a relative value like `./utils` is
   rejected outright (verified). Implemented on the same ts-morph
   `SourceFile` already built for `transformIcons` (walk import and
   export declarations, `setModuleSpecifier`) — AST-accurate, catches
   re-exports, and adds no dependency since ts-morph ships with the
   pinned `shadcn` package.
5. **The portal codemod** (see Portals below): every `<X.Portal …>` JSX
   element becomes `<AppletPortal portal={X.Portal} …>`, importing the
   wrapper from `./applet-portal`.
6. Write files to `.moi/ui/` — requested components, their support files
   (`utils.ts` with `cn`, riding-along registry deps), and
   `applet-portal.tsx`. Requested files that already exist are skipped
   (reported, overwritten only under `--force`); existing support files
   are always kept.
7. With `--install`, run `bun install` for the printed deps in `.moi/`.
   Then print next steps. Nothing else — no rebuild.

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
  ui/                        ← created on first add, never before
    button.tsx
    utils.ts                 ← cn; auto-installed on first add
    applet-portal.tsx        ← portal scope wrapper; auto-installed
  widgets/tracker.tsx        ← import { Button } from '../ui/button'
  package.json               ← base deps pre-seeded at init

<skills dir>/moi-workspace/
  SKILL.md                   ← short section: "need a standard control?
                               moi ui-components add <name>, import ../ui/"
  references/UI-COMPONENTS.md ← the cheat sheet
```

`references/UI-COMPONENTS.md` is the "agent sees all options at once"
artifact from the review: the whole catalog with a one-line use-case and
import per component, the workflow, the customization order, and per-kind
fit (widgets compact, views full-set). Per-component depth deliberately
lives behind `moi ui-components docs <name>` — the agent reads the list
once, then fetches detail on demand. Updated manually when the pinned
shadcn version bumps.

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
`input`, `ring`, `destructive`, `--radius`, shadows). `chart-1…5` use
shadcn's default neutral light/dark palettes and stay fixed across
workspace color presets. `secondary` is still missing — secondary
buttons render with no fill today.

Verified live: **workspace color themes never reach widgets** — the
frame's forced `.dark` class redefines every color token with neutral
constants closer in the cascade than the theme's `documentElement`
props; only fonts pass through. This is the root cause of the
"black-and-white widgets" feedback.

Foundation work implied (hue vs. mode separation):

- Extend derivations to the stuck-neutral tier (`card`, `popover`,
  `border`, `input`, `ring` derive from primary like `muted` does).
- Add `secondary` to `theme.css`, `:root`/`.dark`, and the derivations.
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
item), refresh `references/UI-COMPONENTS.md`, ship.

## Portals (decided: codemod, keep the body portal)

Overlay components portal to `document.body`, escape the applet's scoped
CSS (`[data-applet="…"]` prefixes, `server/bundler/applet-css.ts`), and
half-work on accidentally borrowed host styles. The review considered
re-containering them (Base UI's `container` prop → applet scope — proven
in PR #78) but overlays portal to body _for a reason_: they must escape
the widget frame's `overflow-hidden` and stacking. Decision: **keep the
body portal, put the scope back inside it.**

`add` rewrites every `<X.Portal …>` to `<AppletPortal portal={X.Portal} …>`
(the codemod handles both upstream shapes: self-closing pass-through
wrappers with spread props, and inline `Portal > Positioner > Popup`;
type positions like `X.Portal.Props` are untouched). `AppletPortal`
(installed as `ui/applet-portal.tsx`) renders a hidden marker where the
overlay is _used_ — inside the applet's DOM — reads the nearest
`data-applet` scope from it, and wraps the portalled children in a
`display: contents` element carrying the same attribute. Scoped selectors
match again; root-mapped preflight (fonts, line-height) lands on the
wrapper and inherits down. Verified live: popover, dropdown menu, dialog
(+ backdrop) fully styled while portalled to body.

Known limitation: portalled content resolves theme variables from the
host `:root`, not the widget frame's inline per-widget derivations
(`data-vivid`, dark-surface tokens) — with the default theme they match;
a heavily themed workspace can show slightly off-theme popups. Copying
frame tokens onto the wrapper is a possible follow-up.

## Open items

- Per-kind component rules refinement in `references/UI-COMPONENTS.md`
  (widgets prefer compact/overlay-light patterns; page chrome stays out
  of the set by design).
- Theming foundation (below) — the token-vocabulary work is still open.
- Portal wrapper theme-token copying (see Portals above).

## Ship plan

1. **Foundation** — ✅ synthetic-Tailwind vocabulary inline
   (`build-applet.ts`, covered by a build test), ✅ scaffold dep pre-seed
   (`@base-ui/react`, `class-variance-authority`, `clsx`,
   `tailwind-merge` in `MOI_PACKAGE_JSON`), ✅ default `chart-1…5` palette.
   Still open: token vocabulary (`secondary`, stuck-neutral derivations,
   dark set) — a theming change, tracked separately.
2. **`moi ui-components` v1** — ✅ `add` / `docs` / `list` over the pinned
   engine + the portal codemod; prints next steps, does nothing else;
   offline transform tests in `server/test/ui-components.test.ts`.
3. **Skill** — ✅ SKILL.md pointer + `references/UI-COMPONENTS.md` cheat
   sheet (catalog at a glance, install/rebuild responsibility, the
   relative-import rule, per-kind fit). Ships to every workspace as of skill
   version 0.15.0 — the `moi init --experimental-shadcn` gate is gone.
   Workspaces installed before that get the section on their next
   `moi skill update`.
