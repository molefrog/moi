Bun server on port 3000. Serves the client at `/`, upgrades `/ws` to WebSocket.

- `web.ts` owns the Bun fullstack surface only: the SPA HTML shell (dev bundler + HMR / prebuilt `dist/`), the two WebSocket channels (`/ws` chat, `/api/workspaces/ws` live events), and graceful shutdown. Every HTTP API request is delegated to the Hono app via `fetch`.
- `api.ts` is the Hono REST API (all `/api/*` + legacy `/_rpc/*` routes). `withWorkspace` middleware resolves `:id` → workspace (404 if missing) and stashes it on the context, so handlers read `c.get('ws')`.
- `static.ts` serves prebuilt `dist/` assets in production (no-op in dev). `mei.ts` holds `publishMei` (live-event broadcast) decoupled from `web.ts` to avoid an import cycle; `web.ts` wires it via `setMeiServer`.
- `state.ts` holds global mutable state (messages, session, connected clients). `record()` appends, persists, and broadcasts.
- `agent.ts` sends prompts to Claude via `query()` from the agent SDK. Streams responses back as typed messages. Sessions are resumable.
- WebSocket protocol: server sends `ServerMessage`, client sends `ClientMessage` — both defined in `lib/types.ts`.
- Agent runs in `workspace/` with bypass permissions. Chat history persisted to `workspace/messages.json`.
