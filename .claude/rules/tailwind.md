---
description: Use Tailwind CSS for all styling.
globs: "*.tsx, *.jsx, *.html, *.css"
alwaysApply: false
---

- Use Tailwind CSS for all styling. Do not write custom CSS, inline styles, or CSS modules.
- Prefer existing Tailwind utility classes over custom values. Check https://tailwindcss.com/docs/ before reaching for a custom value.
- Use arbitrary values (e.g. `w-[123px]`, `text-[#ff0000]`) only when no default utility class can achieve the result.
- Do not use `@apply` to create shorthands for combinations of utilities — compose classes directly in JSX/HTML.
