React SPA connecting to the server via WebSocket (`useChat` hook).

- Three chat modes: `solo` (few messages), `sidebar`, `floating` (popover). Switches automatically based on message count and viewport width.
- UI components in `components/ui/` are shadcn built on Base UI React.
- `lib/cn.ts` is `clsx` + `tailwind-merge`.
