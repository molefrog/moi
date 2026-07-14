---
description: Use @tabler/icons-react for all icons.
globs: '*.tsx, *.jsx'
alwaysApply: false
---

- Use `@tabler/icons-react` for all icons. Don't install or use any other icon packages (e.g. `@heroicons/react`, `lucide-react`, `react-icons`, `@untitledui/icons`).
- Import icons from the root: `import { IconName } from "@tabler/icons-react";`
- All icon names use the `Icon` prefix (e.g. `IconArrowUp`, `IconX`, `IconMessage`).
- Icons accept `size` (number) and standard SVG props including `className`.
- Use only the app icon size/stroke pairs below for UI icons. Avoid `14`, `18`, `22`, `28`, `32`, `40`, or other intermediate sizes.

  | Size | Stroke | Usage |
  | --- | --- | --- |
  | `12` | `1.75` | Dense metadata, timeline nodes, and tiny status glyphs |
  | `16` | `1.75` | Compact controls, inline rows, tabs/nav/workspace chrome |
  | `20` | `1.5` | Default standalone actions and normal controls |
  | `24` | `1.5` | Empty states, large affordances, and illustrative UI moments |

- Tabler's package default stroke is `2`, not the app default. Always set the `stroke` prop explicitly on every Tabler icon.
- Inside `<Button>`: icons are sized automatically via CSS — `sm`/`icon-sm` → 16px, `default`/`icon`/`lg`/`icon-lg` → 20px. Do not set `size` on icons inside buttons; still set the `stroke` that matches the rendered button icon size.
