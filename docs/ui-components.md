# moi ui-components

`moi ui-components` copies ready-to-use component source into `.moi/ui/`.
The source registry and component docs are bundled, so both `add` and `docs` work
offline. Workspaces do not need `components.json` or path aliases.

## Catalog

The public catalog is every `registry:ui` and `registry:block` item in
`registry.json`. `data-table` and `date-picker` are recipes that install their
component dependencies. `utils` and `applet-portal` are internal support items.

## Commands

- `moi ui-components` lists the catalog and installed state.
- `moi ui-components add <name…> [--force] [--install]` copies requested items
  and their dependencies into `.moi/ui/`.
- `moi ui-components docs <name…>` prints the bundled markdown docs.

Requested files are skipped when they already exist unless `--force` is used.
Existing support files are always protected. `--install` installs additional
npm dependencies in `.moi/`. Rebuilding remains a separate `moi bundle` step.

## Registry

`registry.json` is the source of truth. `server/ui-components.ts` recursively
loads requested items and same-repository dependencies from disk, deduplicates
files and npm dependencies, and fails when an item or declared file is missing.
There is no remote fallback or install-time source transform.

Files under `ui-components/` are already install-ready:

- imports use sibling paths such as `./button` and `./utils`;
- icons come from `@tabler/icons-react` with explicit strokes from the [icon rules](../.agents/rules/icons.md);
- portalled overlays use `AppletPortal` so applet-scoped styles still match;
- Drawer portals into its view container instead of the page.

Docs live in `ui-components/docs/`. The standard docs are the matching 4.21
snapshot with Tabler icons in the examples. Button and Drawer have concise local docs.

## Updating the snapshot

Generate components with `bunx --bun shadcn@4.21.0` using Base Nova, Base UI,
and Tabler. Keep generated APIs, markup, and styles. Only rewrite imports to
sibling paths, apply applet portal scoping and project icon strokes, and run repository formatting.
Then update `registry.json`, docs, and the pinned `shadcn` dependency together.
Convert doc examples to Tabler too, including imports, icon names, and icon types.

Compare CLI output using the repository's `components.json` and `client/index.css`.
Generated output depends on project settings and theme tokens.

The package whitelist includes `registry.json` and `ui-components/`, which makes
the same files available from packed or published installs.

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

The repository pins `shadcn` to `4.21.0`. Upgrades are deliberate source refreshes:
regenerate all standard components, reapply the source adaptations above, update
the docs snapshot, and run the complete registry tests.

## Portals

Most overlays still portal to `document.body` so they can escape widget
overflow and stacking. `AppletPortal` copies the current applet scope onto the
portalled subtree, which keeps scoped CSS working. This wrapper is already
baked into the checked-in overlay sources.

Known limitation: portalled content resolves theme variables from the
host `:root`, not the widget frame's inline per-widget derivations
(`data-vivid`, dark-surface tokens) — with the default theme they match;
a heavily themed workspace can show slightly off-theme popups. Copying
frame tokens onto the wrapper is a possible follow-up.

Drawer stays inside the applet root so it covers only the current view.

## Open items

- Theming foundation (below) — the token-vocabulary work is still open.
- Portal wrapper theme-token copying (see Portals above).
