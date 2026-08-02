# RFC 0003 — the engine, not the CLI

**One-liner:** moi drives the `shadcn` package's programmatic API directly —
upstream registry as the source of truth, shadcn's own transforms, and a
~10-line in-memory config. No `components.json`, no `tsconfig.json`, no
moi-maintained registry. Supersedes RFC 0001 and 0002.

## What the agent experiences

```
$ moi ui add dropdown-menu
  added .moi/ui/dropdown-menu.tsx, .moi/ui/utils.ts (+ deps, rebuild)
$ moi ui search table          # upstream catalog, fuzzy search
```

```tsx
import { DropdownMenu } from '../ui/dropdown-menu'
```

Same one-line skill as 0001: components come from `moi ui add`, imports from
`../ui/`.

## What lands in the workspace

```
.moi/
  ui/               ← only appears on first use
    dropdown-menu.tsx   upstream source, tabler icons, relative imports
    utils.ts            fetched from the registry too (cn item)
  package.json      ← deps merged (@base-ui/react, cva, clsx, tailwind-merge)
```

Nothing else, ever. The config the shadcn engine needs lives as an object
literal inside moi.

## How it works (all verified in a PoC)

`shadcn` — already a moi dependency — exports its engine: `shadcn/registry`,
`shadcn/utils`, `shadcn/schema`, `shadcn/icons`. `moi ui add` is a thin shim:

1. `getRegistryItems(names, { config })` — config is in-memory; resolves
   `registryDependencies` (e.g. alert-dialog → button) and returns file
   contents.
2. `transformIcons` (shadcn's own, ts-morph): registry content ships
   `<IconPlaceholder lucide="…" tabler="…"/>`; the transform picks tabler and
   writes the `@tabler/icons-react` import. lucide never enters the workspace.
3. Two string replacements make imports relative (`…/lib/utils` → `./utils`,
   `…/ui/x` → `./x`).
4. moi's only own codemod: default overlay portals to the applet container
   (Base UI `container` prop — the fix verified in the browser).
5. Write to `.moi/ui/`, merge item deps into `package.json`, `bun install`,
   rebuild affected applets.

Why this kills the config files: `components.json` exists to tell the CLI the
style, aliases, css path, icon library, and extra registries; `tsconfig.json`
exists only so the CLI can resolve those aliases to disk paths. Driving the
engine, moi _is_ that configuration.

## Why this beats 0001 and 0002

- **Zero workspace config** (0002 needed two files) — the hard constraint.
- **No moi catalog to maintain** (0001's main cost) — upstream is the source
  of truth; the full catalog including future components, day one.
- Discovery and docs come from the same API (`searchRegistries`, item docs
  links) instead of a moi-built index.
- All the hard transforms (icon mapping, member/render rewrites) are shadcn's
  own code, reused rather than reimplemented. moi maintains one small codemod
  (portals) and one string map (relative imports).

## Costs and risks

- The programmatic exports are public but not documented as a stable API —
  pin the exact version and cover the shim with 2–3 smoke tests
  (fetch/transform/write on a known item).
- Registry content can run ahead of the pinned package: live dropdown-menu
  already uses a `cn-rtl-flip` utility no published `shadcn/tailwind.css`
  defines (cosmetic, RTL-only). Pinning + deliberate refresh is the policy
  anyway.
- `moi ui add` needs network to fetch items (the engine has `useCache`);
  offline means no new components, existing ones keep working.
- Registry items can carry `css`/`cssVars` blocks; base-nova ui components
  don't today. V1 ignores them and logs a warning if present.

## Open questions

- Portal codemod vs. serving pre-patched copies of just the overlay trio
  (dialog, popover, dropdown) — codemod keeps upstream as single source;
  pre-patched is simpler but reintroduces a mini-catalog.
- Should `moi ui add` auto-run on first import of a missing `../ui/*` module
  (build error → suggested fix), or stay explicit?
- Expose `moi ui docs <name>` (the engine returns docs/example links) in the
  skill, or keep the surface minimal?
