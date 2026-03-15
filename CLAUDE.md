Agent chat UI powered by Claude Agent SDK, Bun, React, and Tailwind.

## Structure

- `server/` — Bun server, agent SDK, WebSocket, state persistence
- `client/` — React SPA, components, hooks, styles
- `lib/` — Shared types between server and client

## Data flow

Client connects via WebSocket. Agent responses stream back and are broadcast to all clients.

## Commands

- `bun run dev` — Start dev server with hot reload on port 3000
