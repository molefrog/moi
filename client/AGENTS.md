React SPA connecting to the server via WebSocket (`useChat` hook).

Before editing host-app UI, read `../DESIGN.md` and the relevant rules in `../.agents/rules/`. `../DESIGN.md` owns visual direction and semantic choices; topic rules own syntax, component source owns APIs and dimensions, and the theme CSS owns token values. Generic design and shadcn skills may help with craft and component mechanics, but project guidance wins on aesthetics, installed-component policy, and approval requirements.

`../DESIGN.md` applies to host chrome and product surfaces. It does not apply to workspace widget/view internals or generated applets; use their workspace-local design guidance.

## Entities

- **Space** — Top-level container. Has a name and contains widgets and a chat. One space is active at a time.
- **Widget** — A configurable card inside the space's main area. Displayed in a grid. When there are no widgets, the chat fills the whole panel.
- **Chat** — The agent conversation. Contains a scrollable message list and an input. Always lives in the panel. Two modes: sidebar (a bounded pane beside the widgets, or the full panel when there are no widgets) and floating (popover). Floating only applies when there are widgets and they need the room.

## Conventions

- UI components in `components/ui/` are shadcn built on Base UI React.
- `lib/cn.ts` is `clsx` + `tailwind-merge`.
