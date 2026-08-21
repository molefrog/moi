# UI components cheat sheet

The `moi ui-components` command installs standard controls from the shadcn registry, pre-tuned
for moi applets: **Base UI** primitives (not Radix — the parts API differs), **Tabler** icons,
workspace theme tokens, relative imports, and overlays patched so applet styling survives
portalling. Components land in `.moi/ui/` as plain source files you own.

Read this once to know what exists; fetch details per component with
`moi ui-components docs <name>` **before composing a component you haven't used in this
workspace** — the docs carry the full anatomy, props, and copy-pasteable examples.

## Workflow

```sh
moi ui-components                  # catalog + what's installed
moi ui-components add select      # → .moi/ui/select.tsx (+ any support files)
moi ui-components docs select     # official docs as markdown
cd .moi && bun install <deps>     # only when `add` prints extra deps
moi bundle                        # rebuild applets
```

```tsx
// In an applet (.moi/widgets/*.tsx or .moi/views/*.tsx) — always relative:
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
```

Rules of the road:

- `add` writes source files and nothing else. It prints the npm deps a component needs
  (recharts, embla, …) — installing them in `.moi/` and rebuilding is your job. The baseline
  (`@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`) is pre-seeded at
  workspace init; if a build fails on a missing baseline dep (older workspace), install those too.
- Import from `../ui/<name>` only — never `@/` aliases, never the host app's components.
- Customize in this order: workspace theme (`moi theme`) → edit the file in `.moi/ui/`
  (propagates everywhere; `add` refuses to overwrite without `--force`) → `className` at the
  callsite (merges via `cn`).
- `cn()` lives in `../ui/utils` (installed automatically on first add).
- Don't add `dark:` overrides — semantic tokens handle themes. Installed files may contain them
  (upstream design); leave those as they are.
- Overlay components (dialog, dropdown, select, tooltip…) render through
  `../ui/applet-portal.tsx` — an auto-generated support file that keeps applet styles working
  for content portalled to `document.body`. Never edit or remove it, and don't unwire it from
  components.

## Catalog

Form & input:

| Component | Use for | Import |
| --- | --- | --- |
| `button` | Actions; variants `outline`, `ghost`, `destructive`, sizes, icons | `../ui/button` |
| `button-group` | Segmented, joined buttons | `../ui/button-group` |
| `input` | Single-line text | `../ui/input` |
| `textarea` | Multi-line text | `../ui/textarea` |
| `input-group` | Input with addons/buttons/icons attached | `../ui/input-group` |
| `field` | Label + control + description + error, composed | `../ui/field` |
| `label` | Standalone control label | `../ui/label` |
| `checkbox` | Binary choice (indeterminate supported) | `../ui/checkbox` |
| `radio-group` | One-of-N choice | `../ui/radio-group` |
| `switch` | On/off toggle | `../ui/switch` |
| `slider` | Numeric range, one or more thumbs | `../ui/slider` |
| `select` | Pick from a styled popup list | `../ui/select` |
| `combobox` | Type-to-filter picker for long lists | `../ui/combobox` |
| `toggle-group` | Multi/single-select toggle buttons (e.g. view switch) | `../ui/toggle-group` |
| `calendar` | Inline month calendar, ranges | `../ui/calendar` |
| `date-picker` | Pattern: calendar inside a popover — see its docs | compose `calendar` + `popover` |

Overlay (all portal-patched):

| Component | Use for | Import |
| --- | --- | --- |
| `dialog` | Modal with backdrop, header, footer | `../ui/dialog` |
| `alert-dialog` | Blocking confirm for destructive actions | `../ui/alert-dialog` |
| `popover` | Anchored floating panel | `../ui/popover` |
| `dropdown-menu` | Trigger-opened menu, groups & submenus | `../ui/dropdown-menu` |
| `context-menu` | Right-click menu | `../ui/context-menu` |
| `hover-card` | Rich preview on hover | `../ui/hover-card` |
| `tooltip` | Tiny hover/focus label | `../ui/tooltip` |

Display & feedback:

| Component | Use for | Import |
| --- | --- | --- |
| `alert` | Inline callout (info/warn/error) | `../ui/alert` |
| `badge` | Status/count chip | `../ui/badge` |
| `avatar` | Entity image + fallback | `../ui/avatar` |
| `skeleton` | Loading placeholder | `../ui/skeleton` |
| `spinner` | Inline loading indicator | `../ui/spinner` |
| `progress` | Determinate progress bar | `../ui/progress` |
| `table` | Styled table primitives | `../ui/table` |
| `data-table` | Pattern: sorting/filtering/pagination on `table` + `@tanstack/react-table` — see its docs | compose on `table` |
| `chart` | Recharts wired to theme tokens (needs `recharts`) | `../ui/chart` |
| `attachment` | File/image attachment tile | `../ui/attachment` |
| `bubble` | Chat message bubble | `../ui/bubble` |

Structure & navigation:

| Component | Use for | Import |
| --- | --- | --- |
| `accordion` | Stacked expandable sections | `../ui/accordion` |
| `collapsible` | One expandable section | `../ui/collapsible` |
| `tabs` | Tabbed panels | `../ui/tabs` |
| `carousel` | Swipeable slides (needs `embla-carousel-react`) | `../ui/carousel` |
| `pagination` | Page navigation | `../ui/pagination` |
| `resizable` | Draggable split panels (needs `react-resizable-panels`) | `../ui/resizable` |

Support files that appear in `.moi/ui/` without being asked for (`utils.ts`,
`applet-portal.tsx`, and registry dependencies like `separator`, `card`, `toggle`) are normal —
requested components import them. Use them directly if handy.

## Fit within applets

- **Widgets** are small: prefer compact sizes (`size="sm"`), tooltips over labels, popovers over
  dialogs. Page-scale chrome (sidebars, nav menus, sheets) is deliberately not in the set —
  widgets don't need it, and a view's chrome should be custom (see `references/DESIGN.md`).
- **Views** can use the full set, including `resizable` layouts and `data-table`.
- Overlays portal to `document.body` on purpose (they escape the widget frame's clipping). The
  applet-portal patch keeps your applet's Tailwind working inside them. Theme note: portalled
  content reads theme tokens from the app root, not the widget frame — with the default theme
  they match the host; if a popup looks off-theme inside a heavily themed workspace, that's why.
