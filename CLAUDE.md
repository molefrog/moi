Agent chat UI powered by Claude Agent SDK, Bun, React, and Tailwind.

## Structure

- `server/` — Bun server, agent SDK, WebSocket, state persistence
- `client/` — React SPA, components, hooks, styles
- `lib/` — Shared types between server and client

## Data flow

Client connects via WebSocket. Agent responses stream back and are broadcast to all clients.

## Commands

- `bun run dev` — Start dev server with hot reload on port 3000

## Session Storage Notes

Claude Code stores sessions as `.jsonl` files under:
- **macOS/Linux**: `~/.claude/projects/<encoded-path>/`
- **Windows**: `%USERPROFILE%\.claude\projects\<encoded-path>\`

Path encoding: each `/` (or `\` on Windows) in the working directory path is replaced with `-`.
Example: `/Users/foo/my-project` → `-Users-foo-my-project`

Potential use: auto-discover workspaces by listing `~/.claude/projects/` and decoding folder names back to paths.
