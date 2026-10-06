---
description: TypeScript conventions for component filenames, props, types, and type safety.
globs: '*.ts, *.tsx'
alwaysApply: false
---

- Always define a named `type` for component props above the component. Never use inline object types for props. Name it after the component: `type ChatPanelProps = { ... }`.
- Use kebab-case for new React component filenames and their tests, such as `chat-panel.tsx` and `chat-panel.test.tsx`. Keep component and props identifiers in PascalCase: `ChatPanel`, `ChatPanelProps`.
- Never use `any`. Use `unknown` when the type is truly unknown, then narrow it.
- Never cast with `as any`. Prefer proper typing or `as unknown as T` with a comment explaining why.
- Reuse existing types from `lib/types.ts` instead of redefining equivalent shapes.
- Prefer `type` over `interface` for consistency.
- Use `import type` for type-only imports.
