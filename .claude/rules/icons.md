---
description: Use @tabler/icons-react for all icons.
globs: '*.tsx, *.jsx'
alwaysApply: false
---

- Use `@tabler/icons-react` for all icons. Don't install or use any other icon packages (e.g. `@heroicons/react`, `lucide-react`, `react-icons`, `@untitledui/icons`).
- Import icons from the root: `import { IconName } from "@tabler/icons-react";`
- All icon names use the `Icon` prefix (e.g. `IconArrowUp`, `IconX`, `IconMessage`).
- Icons accept `size` (number) and standard SVG props including `className`.
- Default to `size={12}`, `size={16}`, `size={20}`, or `size={24}`. Only use other sizes when explicitly requested.
- Always set `stroke={1.5}` on every Tabler icon by default. Never omit the `stroke` prop.
- Inside `<Button>`: icons are sized automatically via CSS — `sm`/`icon-sm` → 16px, `default`/`icon` → 20px, `lg`/`icon-lg` → 24px. Do not set `size` on icons inside buttons.
