Agent chat UI powered by Claude Agent SDK, Bun, React, and Tailwind.

## Structure

- `server/` — Bun server, agent SDK, WebSocket, state persistence
- `client/` — React SPA, components, hooks, styles
- `lib/` — Shared types between server and client

## Agent context layout

`AGENTS.md` files (root, `client/`, `server/`) are the canonical instructions; every `CLAUDE.md` is a symlink to its sibling `AGENTS.md`. Edit the `AGENTS.md` files, never the symlinks. Rules and skills likewise live in agent-neutral directories, with symlinks for Claude Code:

- `.agents/rules/` — topic rules (canonical). `.claude/rules` is a symlink to it, so Claude Code auto-loads them. **Other agents: read the relevant rule before editing matching files:**
  - `product-language.md` (always) — `moi` casing, sentence case, terminology, and action copy
  - `typescript.md` (`*.ts`, `*.tsx`) — props types, no `any`, `type` over `interface`
  - `tailwind.md` (`*.tsx`, `*.css`) — Tailwind-only styling, no inline styles, `cn()`
  - `icons.md` (`*.tsx`) — `@tabler/icons-react` only, sizing and stroke conventions
  - `animations.md` (`*.tsx`, `*.css`) — `tw-animate-css` utilities, no custom keyframes
  - `bun.md` — Bun instead of Node/npm/vite, Bun-native APIs
  - `README.md` — format for writing new rules
- `.agents/skills/` — skills in the `SKILL.md` [Agent Skills](https://agentskills.io) format (canonical). Codex and other tools that follow the standard discover this directory natively; Claude Code loads them via per-skill symlinks in `.claude/skills/`. When adding a skill, put it in `.agents/skills/<name>/` and add a matching symlink in `.claude/skills/`.

Claude-only config (`.claude/settings.json` hooks, `.claude/launch.json`) stays in `.claude/`.

## Data flow

Client connects via WebSocket. Agent responses stream back and are broadcast to all clients.

## Main app design

`DESIGN.md` is the canonical design guidance for the main app frontend. Before editing host app UI in `client/` (`*.tsx` or `*.css`), read `DESIGN.md` together with `client/AGENTS.md` and the relevant `.agents/rules/` files. It applies to the app shell, chat, settings, menus, workspace list, tabs, panels, and host widget/view chrome. It does **not** govern workspace widget/view internals or generated applets; use workspace-local design guidance for those.

## Commands

- `bun run dev` — Start the dev server on port 13337 (alias for `bun server/cli.ts start --dev`).

### Dev mode

`bun run dev` starts a small supervisor that runs the server **without `bun --hot`**:

- **Frontend (`client/`)** — hot-reloaded in place by `Bun.serve`'s dev bundler (HMR). Edit a React component and the browser updates; no restart.
- **Server (`server/`, `lib/`)** — the supervisor watches these and does a **full process restart** on change (graceful `SIGTERM` → close servers, kill function workers, respawn). Module state is rebuilt cleanly each time.

Do **not** start the server with `bun --hot server/web.ts` or the old `moi start --dev` path: `bun --hot` soft-reloads server modules in place, which churns the dev bundler's chunk hashes and serves **stale frontend bundles** (the symptom: edits don't show up, browser keeps old code). The supervisor exists specifically to avoid this.

Only one server runs at a time — it binds port 13337 (HTTP) and 13059 (control). To restart, kill the existing `bun run dev` process and start it again; a second instance fails on the control port.

### Running `moi` globally (three ways)

- **Dev link**: `bun link` in the repo → `moi` runs current source. Keep `dist/` deleted — if `dist/index.html` exists the server silently serves that stale prebuilt client (`server/static.ts`); only `bun run dev` ignores it (`MOI_DEV`).
- **Prod test before publish**: `bun pm pack` (prepack builds the client) → `bun install -g ./moi-computer-<version>.tgz`. Tests the real artifact: `files` whitelist, prebuilt `dist/`, production React, global install tree.
- **Published**: `bun install -g moi-computer@latest`.

All three overwrite `~/.bun/bin/moi` — last action wins; `readlink ~/.bun/bin/moi` shows which. Kill the running server before switching (single port 13337).

## Browser testing in cloud sandboxes

To drive the app in a browser inside Claude Code on the web, use the vendored **agent-browser skill** (`.agents/skills/agent-browser/`). Cloud-specific setup — server startup, `AGENT_BROWSER_EXECUTABLE_PATH`, Playwright alternative, egress-relay caveats — is in `docs/browser-testing-cloud.md`.

## Session Storage Notes

Claude Code stores sessions as `.jsonl` files under:

- **macOS/Linux**: `~/.claude/projects/<encoded-path>/`
- **Windows**: `%USERPROFILE%\.claude\projects\<encoded-path>\`

Path encoding: each `/` (or `\` on Windows) in the working directory path is replaced with `-`.
Example: `/Users/foo/my-project` → `-Users-foo-my-project`

Potential use: auto-discover workspaces by listing `~/.claude/projects/` and decoding folder names back to paths.
