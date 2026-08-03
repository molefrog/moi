# RFC 0004 — final: two strategies, one decision

The call document. Both strategies give the agent the identical surface —
`moi ui add button`, files in `.moi/ui/`, zero config in the workspace, ever.
Everything below the surface is settled and verified (see
`shadcn-applet-experiments.md`, 3 rounds). The one open question: **where
does component source come from?**

## Strategy A — live engine (was RFC 0003)

moi drives the `shadcn` package's programmatic API; the upstream registry is
the source of truth. In-memory config, shadcn's own `transformIcons` to
tabler, relative-import rewrite, moi's portal codemod. Rides along free:
`search` (upstream index), `docs` (pages fetchable as markdown), `example`
(real usage source as registry items), `diff` (update story). Costs: pin the
engine version (exports public but not semver-documented), registry content
can run ahead of the pinned package, network at add time.

## Strategy B — bundled lite

moi ships ~15–20 vetted components inside the moi package — the same source
the host app and demos use — and `moi ui` is a super-lite shadcn: add = file
copy + dep merge + rebuild. No registry, no protocol, no network. Authoring:
port upstream base-nova source once, apply the same transforms in moi's
repo, review, commit; updates ride moi releases and skill update. Strengths:
deterministic, offline, demo quality by construction, pinned deps. Costs:
the catalog is what we port; drift needs periodic re-porting; docs/examples/
search must be bundled or dropped.

## Head to head

|                      | A — live engine              | B — bundled lite            |
| -------------------- | ---------------------------- | --------------------------- |
| Source of truth      | upstream registry            | moi package (vetted copies) |
| Catalog              | full upstream, day one       | ~15–20, grows by porting    |
| Freshness            | continuous                   | on moi releases             |
| Network at add time  | required (cached)            | none                        |
| Deterministic output | pinned-version approximation | byte-exact                  |
| moi maintains        | shim + portal codemod        | the component set itself    |
| Docs/examples/search | free from upstream           | bundle or drop              |
| Looks like the demos | close (DESIGN.md-steered)    | exactly (same source)       |
| Main failure mode    | upstream drift breaks shim   | catalog goes stale          |

## The hybrid

**B's supply, A's machinery.** The engine's base URL is one env var
(`REGISTRY_URL`). Bundle snapshots of registry item JSONs inside moi, serve
them from the local server, point the engine there: offline and
deterministic like B, but updating the catalog is a re-snapshot script, and
flipping one URL turns live upstream back on. The strategies are two supply
modes for the same pipeline, not rivals.

## How to decide

The remaining question is editorial: **who curates — shadcn's team or us?**
If the demo-quality look is the product promise, B guarantees it by
construction at a recurring porting cost. If breadth, freshness, and minimal
maintenance win, A delivers and DESIGN.md carries the look. The hybrid
defers the choice: start from snapshots, go live when trust is earned.

Artifact for the call:
https://claude.ai/code/artifact/11964776-9711-40ef-b988-2a960e5e1cc2
