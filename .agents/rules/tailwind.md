---
description: Use Tailwind CSS for all styling.
globs: '*.tsx, *.jsx, *.html, *.css'
alwaysApply: false
---

- Use Tailwind CSS for component styling. Do not write CSS modules or inline styles (`style={{...}}`). Existing theme and global infrastructure in `client/index.css` and `client/theme.css` are the CSS exception; do not add or change design tokens without explicit approval.
- Use arbitrary values only when necessary for geometry or unsupported CSS properties, such as `w-[123px]` or `[clip-path:circle(50%)]`. Never use arbitrary raw colors; use the semantic tokens defined by the theme.
- Prefer existing Tailwind utility classes over custom values. Check https://tailwindcss.com/docs/ before reaching for a custom value.
- When adding or changing font weight, use only regular weight (the default, or `font-normal` when an explicit reset is needed) and `font-medium`. Never introduce another font-weight utility; other weights are reserved for owner hand-tuning.
- Prefer `scroll-fade` when a scrollable region needs an edge cue. Use `no-scrollbar` when the fade provides enough scroll affordance. Keep a visible scrollbar on primary reading surfaces.
- Do not add manual `dark:` color overrides. Semantic color tokens handle themes.
- Do not use `@apply` to create shorthands for combinations of utilities — compose classes directly in JSX/HTML.
- Use `cn()` from `@/client/lib/cn` with multiple arguments for conditional classes. Never use template literals with ternaries for `className` — use `cn('base', condition && 'conditional')` instead.
