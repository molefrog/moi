React SPA connecting to the server via WebSocket (`useChat` hook).

## Entities

- **Space** — Top-level container. Has a name and contains widgets and a chat. One space is active at a time.
- **Widget** — A configurable card inside the space's main area. Displayed in a grid. Visible when the chat has moved out of solo mode.
- **Chat** — The agent conversation. Contains a scrollable message list and an input. Three modes: solo (centered, no widgets), sidebar (pinned right of widgets), floating (popover). Starts solo, switches after 5 messages based on viewport width.

## Conventions

- UI components in `components/ui/` are shadcn built on Base UI React.
- `lib/cn.ts` is `clsx` + `tailwind-merge`.
