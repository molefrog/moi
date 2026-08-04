# RFCs — shadcn components for applets

**Decision: `0005-final-moi-shadcn.md` — `moi shadcn`, an opinionated
shadcn-lite proxy (strategy A's engine, moi's opinions), with the blind-spot
list to settle before building.** Earlier stages: `0004-two-strategies.md`
was the comparison document; 0001 and 0002 were explored first and
rejected on review (0001 means maintaining our own registry; 0002 puts
`components.json` + `tsconfig.json` into every workspace — both
non-starters). **0003 is the current proposal**, built on a source dive into
the `shadcn` package. Evidence behind every claim:
`docs/shadcn-applet-experiments.md`.

**Shared foundation (ships in any case):**

1. Inline `tw-animate-css` + `shadcn/tailwind.css` into the applet's synthetic
   Tailwind entry — without it every shadcn idiom is silently dropped
   (verified, +11 KB, patch already on this branch). This is exactly the css
   the base-nova style item declares.
2. Fix the missing `secondary` token in the host theme — secondary buttons
   render with no fill today, shadcn or not.
3. Components live in `.moi/ui/`, one fixed place; overlays must portal into
   the applet scope (Base UI `container` prop, fix verified in browser).
4. Skill guidance collapses to one file under `references/`; rules: always
   Base UI, tabler icons, tokens only. Nothing exists until first use.

**The comparison:**

|                     | 0001 blessed registry   | 0002 vanilla CLI               | 0003 engine (proposed)     |
| ------------------- | ----------------------- | ------------------------------ | -------------------------- |
| Agent runs          | `moi ui add`            | `bunx shadcn add`              | `moi ui add`               |
| Config in workspace | none                    | `components.json` + `tsconfig` | none                       |
| Catalog             | ~15–20 moi-curated      | full upstream                  | full upstream              |
| Maintained by moi   | whole component catalog | scaffold + `@moi` overlays     | thin shim + portal codemod |
| Transforms          | pre-applied by hand     | CLI defaults only              | shadcn's own, programmatic |
| Rejected because    | fancy registry to own   | config files in workspace      | — (current proposal)       |

0003 keeps 0001's agent surface (`moi ui add`, zero config) and 0002's
upstream catalog, without either's cost: the `shadcn` package exports its
engine (`shadcn/registry`, `shadcn/utils`), every function accepts an
in-memory config, and its own `transformIcons` maps registry content to
tabler. Verified end to end in a PoC — see the experiment log, round 2.
