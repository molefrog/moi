# RFC 0005 — final: `moi shadcn`, an opinionated shadcn-lite proxy

The decision. One command driven by shadcn's own engine (RFC 0003's
mechanism), wrapped in moi's opinions. Upstream catalog, zero config in the
workspace, Base UI only. Deck:
https://claude.ai/code/artifact/8deb60f0-07f0-4d8a-9f10-91d664e08e6b

## The strategy

- `moi shadcn` — limited on purpose. V1: `add`, `docs` (fetched as
  markdown), `list` (with fuzzy search). Soon: `example` (registry usage
  source), `diff` (update story). Never: `init`, `build`/`registry`, `mcp`,
  `eject`, presets.
- Opinionated: no `components.json`, no `tsconfig.json`, always and only
  Base UI, tabler icons, workspace tokens.
- Components in `.moi/ui/` (`button.tsx`, …). The main skill knows about it;
  widgets import relatively: `../ui/button`.
- Skill carries `references/shadcn.md` — a one-file compilation of the
  essentials extracted from the official skill (`bunx --bun skills add
shadcn/ui`). Extraction is mandatory, not cosmetic: the official skill's
  first move (`shadcn info`) requires `components.json`.

## Blind spots — part 1: these change what we build

1. **Portals.** Overlays portal to `document.body`, escape the scoped CSS,
   and half-work on borrowed host styles (verified: light popup on dark
   widget). The portal codemod belongs inside `add`.
2. **Deps don't install themselves.** base-nova items declare zero npm
   deps — `add` must merge `@base-ui/react` + `cva` (+ `clsx` +
   `tailwind-merge`) into `.moi/package.json` and run `bun install`.
3. **`ui/utils.ts` (cn) is required.** Every component imports it; it's a
   registry item — auto-install on first `add`, rewrite imports to
   `./utils`.
4. **`add` must own the rebuild.** Bare-specifier changes aren't
   staleness-tracked; without a forced rebuild widgets serve stale bundles.
5. **Prerequisite patches.** Synthetic-Tailwind inline + `secondary` token
   fix must land first, or fetched components silently lose their variants
   and animations. Both patches exist and are tested.

## Blind spots — part 2: decide before building

1. **`add` vs. customization.** If agents customize by editing `.moi/ui/`,
   re-running `add` must not silently overwrite. Proposal: refuse + show
   diff; overwrite only behind an explicit flag.
2. **Relative-import rule needs teeth.** Agents habitually write
   `@/ui/button`. Backstop: the bundler's unresolved-import error should
   say "use ../ui/button".
3. **Pin the engine and the style.** Programmatic exports aren't
   semver-documented; registry content runs ahead of published css
   (`cn-rtl-flip`). Pin `shadcn` version + `base-nova`; refresh
   deliberately with smoke tests.
4. **Offline UX.** `add` needs network — fail with a plain message, not a
   stack trace. Snapshot supply via `REGISTRY_URL` stays open as v2.
5. **Per-kind component rules.** `sheet`/`navigation-menu`/page chrome
   conflict with the widget frame contract — `references/shadcn.md`
   carries a "views yes, widgets no" list.
6. **Reference-file drift.** Regenerate `references/shadcn.md` as part of
   `moi skill update` (version marker exists); a script, not a chore.

## Rulings (Aug 2 review)

- **Deps:** the scaffold pre-seeds `@base-ui/react` + `class-variance-authority`
  (+ `clsx`/`tailwind-merge`) at init. The command never installs — `add`
  ends with "component added; make sure deps are installed", and the skill
  makes install the agent's job. Old workspaces without the pre-seed are
  covered by the same fallback: the skill lists the required deps, a
  failing build is the signal, and the agent adds them itself. Pre-seeding
  is the ideal path, not a requirement.
- **Rebuilds:** the command never rebuilds. `add` writes source files only
  and prints next steps; the agent runs `bun install` / `moi bundle`. The
  command is deliberately not smart.
- **Overwrite:** existing file → `add` fails with a message naming the
  `--force` flag.
- **Imports:** the relative-import rule lives in the skill; no bundler
  changes (unresolved imports already fail loudly).
- **Offline:** unsupported for now — `add` goes straight to the shadcn
  registry.
- **`ui/utils.ts`:** auto-installed on first `add`. Confirmed.
- **Portals/overlays:** parked as a dedicated review point (options:
  codemod in `add`, pre-patched overlay copies, runtime portal host).
- **Pinning, in plain words:** the engine functions are public exports but
  the shadcn team doesn't promise API stability for them — so moi pins an
  exact version (no `^`) and upgrades deliberately behind smoke tests.
- **Reference regeneration:** manual updates ruled acceptable — the
  one-pager is refreshed by hand when the pinned shadcn version bumps; the
  scripted re-derivation stays available if that gets tiresome.

## Ship plan

1. **Foundation PR** — synthetic Tailwind inline, `secondary` token,
   applet portal host (decision-independent, tested).
2. **`moi shadcn` v1** — `add`/`docs`/`list` over the pinned engine with
   the part-1 fixes baked in, plus smoke tests.
3. **Skill** — SKILL.md pointer + generated `references/shadcn.md`, wired
   into skill update.

To settle: overwrite semantics, the widget blacklist, `docs` output shape
(recommendation: fetched markdown).
