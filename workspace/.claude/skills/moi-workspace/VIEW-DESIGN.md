View design guidelines. Read before creating or modifying any view.

## The one idea

A view is a **real app screen**, not a giant widget. Where a widget earns one glanceable moment, a view earns **structure**: a clear header, a primary work area, and a calm, scannable layout the user can sit inside for minutes, not seconds. It should look like a page someone designed on purpose — never a naked card stretched to fill the screen.

## Rules — never break

- **Own the whole frame.** The root is `w-full h-full` and handles **its own scrolling** (`overflow-auto`) — there is no outer scroll container. Provide your own padding, header, and chrome.
- **One view = one screen.** No client-side routing inside a view; cross-screen navigation is the workspace nav. Internal sub-navigation (tabs, a master/detail split) is yours to build.
- **Three states, always.** Loading → a skeleton that mirrors the real layout (never a spinner). Error → one human sentence + a retry. Empty → a short prompt, never blank.
- **Tailwind for static styling.** No custom CSS, no `@apply`, no static `style={{}}`. Icons only from `@tabler/icons-react`; use the host project icon rule when present (`.agents/rules/icons.md`) instead of duplicating size/stroke guidance. Views import only from their own folder.

## Layout

- Give the page a **header band** (title, optional subtitle or primary action) and a **content region** below it. Constrain wide content with a max width and center it (`mx-auto max-w-…`) rather than letting tables and forms run edge to edge.
- Use generous, consistent padding (`p-6`/`p-8`). A view has room a widget never does — use whitespace and grouping, not dividers, to create structure.
- Tables, boards, and lists are the natural view shapes. Bounded internal scrollers (a sticky header over a scrolling table, a horizontal kanban) are fine; the page itself never scrolls sideways.

## Visual language

Color, type, motion, and the state patterns are **the same vocabulary as widgets** — see `DESIGN.md` for tokens, color anchors, and motion ranking. A view should feel like the same family as the workspace's widgets: shared hero font, shared accent colors, the same restraint. The difference is scale, not style.
