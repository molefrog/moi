---
description: Use @untitledui/icons for all icons.
globs: '*.tsx, *.jsx'
alwaysApply: false
---

- Use `@untitledui/icons` for all icons. Don't install or use any other icon packages (e.g. `@heroicons/react`, `lucide-react`, `react-icons`).
- Import icons from the root: `import { IconName } from "@untitledui/icons";`
- Icons accept `size` (number) and standard SVG props including `className`.
- Default to `size={12}`, `size={16}`, `size={20}`, or `size={24}`. Only use other sizes when explicitly requested.
- Inside `<Button>`: icons are sized automatically via CSS — `xs`/`icon-xs` → 16px, `default`/`icon` → 20px, `lg`/`icon-lg` → 24px. Do not set `size` on icons inside buttons.
