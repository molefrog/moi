Bun server on port 13337. Serves the client at `/`, upgrades `/ws` to WebSocket.

- `web.ts` owns the Bun fullstack surface only: the SPA HTML shell (dev bundler + HMR / prebuilt `dist/`), the two WebSocket channels (`/ws` chat, `/api/workspaces/ws` live events), and graceful shutdown. Every HTTP API request is delegated to the Hono app via `fetch`.
- `api.ts` is the Hono REST API (all `/api/*` routes). `withWorkspace` middleware resolves `:id` → workspace (404 if missing) and stashes it on the context, so handlers read `c.get('ws')`. Its catch-all serves the prebuilt client from `dist/` in prod via Hono's `serveStatic` (cached, traversal-safe).
- `static.ts` exposes the `dist/` location (`DIST_DIR`), the `prebuilt` flag, and the prod SPA `distShell`. `events.ts` holds `publishEvent` (server→client live-event broadcast over `/api/workspaces/ws`) decoupled from `web.ts` to avoid an import cycle; `web.ts` wires it via `setEventServer`.
- `state.ts` holds the connected chat clients and `broadcast()` (which also feeds the harness debug tap).
- `harness/` holds every agent backend (Claude Code, OpenClaw, Codex): per-harness adapter + session + transport + protocol NOTES, colocated. Read `harness/README.md` for the message-type layers, the adapter contract, and the folder conventions before touching agent-backend code.
- WebSocket protocol: server sends `ServerMessage`, client sends `ClientMessage` — both defined in `lib/types.ts`.
- Agents run in the workspace directory with bypass permissions; each backend persists its own session history (see `harness/README.md`).
