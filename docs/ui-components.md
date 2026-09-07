# moi ui-components

`moi ui-components` copies ready-to-use component source into `.moi/ui/`.
Workspaces do not need `components.json` or path aliases.

## Catalog

The public catalog is every `registry:ui` and `registry:block` item in
`registry.json`. Some entries are recipes that install the components needed for
composition and include docs explaining how to put them together. `utils` and
`scoped-portal` are internal support items.

## Commands

- `moi ui-components` lists the catalog and installed state.
- `moi ui-components add <name…> [--force] [--install]` copies requested items
  and their dependencies into `.moi/ui/`.
- `moi ui-components docs <name…>` prints the bundled markdown docs.

Requested files are skipped when they already exist unless `--force` is used.
Existing support files are always protected. `--install` installs additional
npm dependencies in `.moi/`. Rebuilding remains a separate `moi bundle` step.

## Registry

`registry.json` is the source of truth. `server/ui-components.ts` uses the
pinned shadcn registry loader to read it, then recursively collects local
dependencies and deduplicates files and npm packages. The CLI accepts only
names from the bundled catalog, so installs work offline.

Files under `ui-components/` are already install-ready:

- imports use sibling paths such as `./button` and `./utils`;
- icons come from `@tabler/icons-react` with explicit strokes from the [icon rules](../.agents/rules/icons.md);
- portalled overlays use `ScopedPortal` so applet-scoped styles still match;
- Drawer portals into its view container instead of the page.

Docs live in `ui-components/docs/`. The standard docs are the matching 4.21
snapshot with Tabler icons and moi installation commands. Button and Drawer
have concise local docs.

Components shared with the host are re-exported from `client/components/ui/`.
Keep their implementations in `ui-components/`; the re-export coverage test is
the source of truth for the shared set. A host-only compatibility copy should
explain why it cannot use the registry source yet.

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

## Build integration

Every applet build starts from a CSS entry moi generates
(`writeSyntheticTailwindCss` → `.moi/.build/<kind>-tailwind.css`):
`@import 'tailwindcss'`, followed by the shared theme, `tw-animate-css`,
`shadcn/tailwind.css`, the applet variants, and `@source`. Moi inlines these
styles from its own dependencies. Workspaces gain no CSS dependencies, and
Tailwind emits only utilities used by the applet and its imported `.moi/ui/`
files.

## Portals

Most overlays still portal to `document.body` so they can escape widget
overflow and stacking. `ScopedPortal` copies the current applet scope onto the
portalled subtree, which keeps scoped CSS working. This wrapper is already
baked into the checked-in overlay sources.

Known limitation: portalled content resolves theme variables from the
host `:root`, not the widget frame's inline per-widget derivations
(`data-vivid`, dark-surface tokens) — with the default theme they match;
a heavily themed workspace can show slightly off-theme popups. Copying
frame tokens onto the wrapper is a possible follow-up.

Drawer stays inside the applet root so it covers only the current view.
