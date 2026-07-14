---
description: Use tw-animate-css for animations.
globs: '*.tsx, *.jsx, *.html, *.css'
alwaysApply: false
---

- Use `tw-animate-css` utility classes for all animations. Do not write custom `@keyframes` in CSS.
- Shorthands: `animate-in`, `animate-out`, `fade-in`, `fade-out`, `zoom-in-95`, `zoom-out-95`, `slide-in-from-top-2`, `slide-in-from-right-4`, `spin-in`, etc. See https://github.com/Wombosvideo/tw-animate-css for the full list.
- Control duration with `duration-200`, delay with `delay-150`, and easing with `ease-out` / `ease-in-out`.
- Compose enter/exit animations: e.g. `animate-in fade-in-0 zoom-in-95 duration-200`.
- Prefer `tw-animate-css` over `motion` props for ordinary enter/exit and visual feedback. Use `motion/react` only for layout animation, height transitions, or orchestration that utility classes cannot express cleanly.
- Do not add custom keyframes. Existing keyframes in `client/index.css` are legacy exceptions, not patterns to copy.
