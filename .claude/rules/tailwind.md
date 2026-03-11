---
description: Use Tailwind CSS for all styling.
globs: '*.tsx, *.jsx, *.html, *.css'
alwaysApply: false
---

- Use Tailwind CSS for all styling. Do not write custom CSS, CSS modules, or inline styles (`style={{...}}`).
- Never use `style={{...}}` in JSX — Tailwind can always express it. Use arbitrary values (e.g. `w-[123px]`), arbitrary properties (e.g. `[animation-delay:0.2s]`, `[clip-path:circle(50%)]`), and CSS variables via `[--name:value]`.
- Prefer existing Tailwind utility classes over custom values. Check https://tailwindcss.com/docs/ before reaching for a custom value.
- Use arbitrary values (e.g. `w-[123px]`, `text-[#ff0000]`) only when no default utility class can achieve the result.
- Do not use `@apply` to create shorthands for combinations of utilities — compose classes directly in JSX/HTML.
