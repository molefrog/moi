# shadcn in applets — experiment log

Findings from actually running shadcn against the applet pipeline (CLI probes,
`buildApplet` builds, and a live browser session). Context: the Jul 27/31
discussions — keep moi zero-config and self-contained, components in one place
next to widgets and views, always Base UI, no `components.json` in the
workspace. This log records what is empirically true; the companion patch in
`server/bundler/build-applet.ts` (marked `EXPERIMENT`) is the minimal change
that makes shadcn markup compile in applets.

## CLI probes

- `shadcn add` **hard-requires** `components.json` _and_ `tsconfig.json` in the
  target. Without `components.json` it launches the full init wizard (framework
  picker); without `tsconfig.json` it errors out. Going through the vanilla CLI
  inside `.moi/` therefore costs three config files (`components.json`,
  `tsconfig.json`, a CSS file for the `tailwind.css` field) — the CSS file can
  be an empty stub, it is not touched by `add`.
- With a 9-line `components.json` + minimal `tsconfig.json`, `add button`
  writes exactly one file (`ui/button.tsx`) and nothing else. base-nova
  registry items declare **no dependencies** — init is assumed to have
  installed `@base-ui/react` and `class-variance-authority`, and `cn` is
  assumed to exist at the utils alias. A moi installer must supply both.
- `shadcn add <abs-path>.json` installs from a **local registry-item file**
  with no network, and declared `dependencies` in the item _do_ get installed
  into the target `package.json`. A `registries` entry mapping
  `@moi → http://127.0.0.1:<port>/{name}.json` also works (`add @moi/x`);
  `file://` templates are rejected ("not implemented... yet"). moi serving its
  own blessed registry over the local server is fully viable today.
- `shadcn eject` text-inlines `shadcn/tailwind.css` into the project stylesheet
  and removes the dep — upstream endorsement of the text-inline approach the
  applet patch uses.
- Agent-facing surface exists: `search @shadcn -q <term>`, `docs <name>`
  (doc/example links, `--json`), `view <name>` (full item JSON).

## Build pipeline (buildApplet on a real widget)

Fixture: `.moi/ui/{button,popover,utils}.tsx` (base-nova via CLI, imports
rewritten to relative + local `cn` with `tailwind-merge`), widget using
variants, `data-open:` classes, `animate-in`, `scroll-fade`, `no-scrollbar`.

- **Baseline (unpatched synthetic CSS): every shadcn idiom is silently
  dropped.** No `data-open/closed/checked` variants, no `animate-*`
  (tw-animate-css), no accordion keyframes, no `scroll-fade`/`no-scrollbar`,
  no `bg-secondary`. Tailwind v4 drops unknown utilities without warning.
- **Patched** (inline `tw-animate-css` + `shadcn/tailwind.css` into
  `writeSyntheticTailwindCss`, mirroring host `client/index.css` order): all of
  the above emit, correctly scoped under `[data-applet="…"]`. Cost: **+11 KB**
  CSS (61 → 72 KB, emission is usage-driven). `@property` registrations pass
  through unscoped — global but idempotent, harmless. All 54
  build-applet/applet-css tests pass unchanged.
- Both files are `@import`-free, so text-inlining from moi's own
  `node_modules` (the `HOST_THEME_PATH` pattern) needs no workspace deps.
  Note: `Bun.resolveSync` cannot resolve `tw-animate-css` (its exports map
  only has a `style` condition) — use a direct path.

## Token gap: `secondary` is missing everywhere (host bug, pre-shadcn)

`--color-secondary` / `--color-secondary-foreground` exist in neither
`client/theme.css` nor `client/index.css`, yet the host `button.tsx` has a
`secondary` variant used by 9+ host features. **`bg-secondary` and
`text-secondary-foreground` never compile — secondary buttons render with no
fill in the host app today.** Likely part of the known "accent colors"
complaints. Fix: add the alias to `theme.css` and raw values to `index.css`
`:root`/`.dark` (also worth auditing `destructive-foreground`, `chart-*`).

## Live browser run (dev server + real workspace)

- The widget renders shadcn Button/Popover correctly with the patched build.
- **Portal reality is worse than "unstyled":** the popover portals to
  `document.body`, escapes `[data-applet]`, and gets _accidentally_ styled by
  the host's global CSS wherever class names overlap (`bg-popover`,
  `shadow-md`, `ring-border`…). Result: a **light-themed popup over a
  force-dark widget**, host radius instead of applet radius — subtle theme
  bleed, not an obvious breakage.
- **The fix is a first-class API.** Every Base UI portal part takes a public
  `container` prop. Patching `PopoverContent` with a hidden in-tree marker +
  `closest('[data-applet]')` as the portal container made the popup land
  inside the scope: dark tokens, applet radius, verified visually and via
  computed styles. A moi-blessed component set can bake this in once per
  overlay component (a shared `useAppletPortalContainer()` in `ui/utils`), or
  the host can expose a scoped portal host on the `moi` bridge.

## What this means for the design

1. Inlining the two CSS extensions into the synthetic entry is cheap, safe,
   and unblocks all shadcn markup — worth shipping regardless of the rest
   (applets gain the `animate-in` vocabulary the host rules already use).
2. The vanilla CLI is not zero-config-able (3 files minimum), but the
   registry layer is: a `moi ui add` that fetches registry items (moi-blessed
   local ones first, upstream as fallback) and writes into `.moi/ui/` gets the
   full shadcn component catalog with zero workspace config.
3. Overlay components need the portal-container adaptation baked into the
   blessed copies; without it they _mostly_ work by luck of host CSS overlap,
   which is the worst failure mode to debug.
4. Fix the `secondary` token gap in the host first — it bites today, shadcn
   or not.

Repro: fixtures and scripts live in the session scratchpad; the flow is
`shadcn add` into a scaffolded `.moi`-shaped dir → `buildApplet` via a small
runner → grep the CSS payload registered on `__moiAppletCss`.
