React SPA connecting to the server via WebSocket (`useChat` hook).

## Entities

- **Space** — Top-level container. Has a name and contains widgets and a chat. One space is active at a time.
- **Widget** — A configurable card inside the space's main area. Displayed in a grid. When there are no widgets, the chat fills the whole panel.
- **Chat** — The agent conversation. Contains a scrollable message list and an input. Always lives in the panel. Two modes: sidebar (a bounded pane beside the widgets, or the full panel when there are no widgets) and floating (popover). Floating only applies when there are widgets and they need the room.

## Conventions

- UI components in `components/ui/` are shadcn built on Base UI React.
- `lib/cn.ts` is `clsx` + `tailwind-merge`.
