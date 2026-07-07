---
description: Use tw-animate-css for animations.
globs: '*.tsx, *.jsx, *.html, *.css'
alwaysApply: false
---

- Use `tw-animate-css` utility classes for all animations. Do not write custom `@keyframes` in CSS.
- Shorthands: `animate-in`, `animate-out`, `fade-in`, `fade-out`, `zoom-in-95`, `zoom-out-95`, `slide-in-from-top-2`, `slide-in-from-right-4`, `spin-in`, etc. See https://github.com/Wombosvideo/tw-animate-css for the full list.
- Control duration with `duration-200`, delay with `delay-150`, and easing with `ease-out` / `ease-in-out`.
- Compose enter/exit animations: e.g. `animate-in fade-in-0 zoom-in-95 duration-200`.
- Always prefer tw-animate-css utility classes over framer motion `animate`/`transition` props or custom CSS for visual effects like wiggle, shake, pulse, or bounce. Only use framer motion for layout animations and enter/exit orchestration.
- For animations that tw-animate-css doesn't cover (e.g. infinite pulsing dots), define a `@keyframes` in CSS and reference it with `animate-[name]`. This should be rare.
