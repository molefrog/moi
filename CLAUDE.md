Agent chat UI powered by Claude Agent SDK, Bun, React, and Tailwind.

## Structure

- `server/` — Bun server, agent SDK, WebSocket, state persistence
- `client/` — React SPA, components, hooks, styles
- `lib/` — Shared types between server and client

## Data flow

Client connects via WebSocket. Agent responses stream back and are broadcast to all clients.

## Commands

- `bun run dev` — Start the dev server on port 13337 (alias for `bun server/cli.ts start --dev`).

### Dev mode

`bun run dev` starts a small supervisor that runs the server **without `bun --hot`**:

- **Frontend (`client/`)** — hot-reloaded in place by `Bun.serve`'s dev bundler (HMR). Edit a React component and the browser updates; no restart.
- **Server (`server/`, `lib/`)** — the supervisor watches these and does a **full process restart** on change (graceful `SIGTERM` → close servers, kill function workers, respawn). Module state is rebuilt cleanly each time.

Do **not** start the server with `bun --hot server/web.ts` or the old `moi start --dev` path: `bun --hot` soft-reloads server modules in place, which churns the dev bundler's chunk hashes and serves **stale frontend bundles** (the symptom: edits don't show up, browser keeps old code). The supervisor exists specifically to avoid this.

Only one server runs at a time — it binds port 13337 (HTTP) and 13059 (control). To restart, kill the existing `bun run dev` process and start it again; a second instance fails on the control port.

## Browser testing in cloud sandboxes

To drive the app in a browser inside Claude Code on the web, use the vendored **agent-browser skill** (`.claude/skills/agent-browser/`). Cloud-specific setup — server startup, `AGENT_BROWSER_EXECUTABLE_PATH`, Playwright alternative, egress-relay caveats — is in `docs/browser-testing-cloud.md`.

## Session Storage Notes

Claude Code stores sessions as `.jsonl` files under:

- **macOS/Linux**: `~/.claude/projects/<encoded-path>/`
- **Windows**: `%USERPROFILE%\.claude\projects\<encoded-path>\`

Path encoding: each `/` (or `\` on Windows) in the working directory path is replaced with `-`.
Example: `/Users/foo/my-project` → `-Users-foo-my-project`

Potential use: auto-discover workspaces by listing `~/.claude/projects/` and decoding folder names back to paths.
