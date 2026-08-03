# RFC: `moi service` + `moi update`

Goal: the moi server can run as an always-on user-level service that survives reboots and crashes, and the CLI has a manual update command. macOS and Linux; no root/sudo anywhere.

Context: today `moi start` is a foreground process attached to a terminal, and updating is a manual `bun/npm i -g`. Television (`@telepath-computer/television`) solved the same problem with a `serve --persist` flag writing launchd/systemd-user units and an agent-driven upgrade doc — useful as a reference, not a template.

## Version awareness (prerequisite)

- The running server reports its own package version (e.g. via `/status`).
- `moi status` shows installed CLI version vs running server version and warns when they differ.
- Must work no matter how the upgrade happened (`moi update` or a manual package-manager install) — freshness detection cannot live inside the update command.

## `moi service`

- User can install, uninstall, restart, and check the service from the CLI (naming/subcommand shape up to you).
- Starts on login/boot, restarts on crash, survives reboots.
- No third-party daemon/process-manager dependency (no pm2, no `@rupertsworld/daemon`) — decided.
- The service manager must supervise the actual server process, not a launcher that spawns it as a child.
- Only sensible for a real global install; running from a git checkout should be refused clearly.
- Environment: the service gets whatever is captured **at install time** — decided. No runtime env file, and the existing `moi env` (workspace-scoped) is unrelated. The captured env must be enough for the server to spawn agent harnesses (`claude`, `openclaw`); daemons don't inherit shell profiles, so PATH needs deliberate handling.
  - `[verify]` agent sessions actually work under a daemon with captured env only — incl. Claude Code auth (Keychain on macOS) and `PUBLIC_TLDRAW_LICENSE_KEY`.
- Server stdout/stderr must be captured somewhere durable, discoverable from the CLI (a way to view/tail logs), and must not grow unboundedly.
  - `[research]` platform log stories differ (systemd journal vs launchd file redirection with no rotation) — pick per-platform behavior.
- Clean shutdown on the service manager's stop signal.
  - `[verify]` how the current server behaves on SIGTERM (live agent sessions, functions workers).
- A server that crashes at startup (config error, port taken) must not respawn-loop forever.
  - `[research]` restart-policy scoping options in launchd and systemd user units.
- Known platform gotchas to account for somehow (user-facing messaging, detection, or docs — your call):
  - macOS shows a "background item added" notification identifying as "bun" on first install.
  - Linux user services stop with the login session on headless machines unless lingering is enabled.
  - The interpreter/binary paths captured at install can go stale (bun moved/reinstalled).
- `moi start` and the service coexist: a user with the service running who types `moi start` should end up understanding the situation, not confused.

## `moi update`

- Manual command only — no background checks, no auto-update.
- Checks the npm registry for the latest published version and compares with the installed one.
- Installed version is a prerelease (e.g. `0.5.2-next.1`) → say prereleases are updated manually, do nothing.
- moi may have been globally installed with any package manager (bun, npm, pnpm, …) — the update must go through whichever one owns the current install, and never create a second shadowing install.
  - `[verify]` how to reliably detect the owning package manager across bun/npm/pnpm/yarn on macOS + Linux.
- After updating: a service-managed server should end up on the new version, verified via the version report. A foreground server (someone's terminal) gets a **warning only** — decided; never kill it.
- Package-manager failures (e.g. EACCES on a root-owned npm prefix) surface clearly with the manual fallback command.

## Out of scope (leave seams)

- Curated update-channel / in-UI update notifications (the server version report is the seam).
- Windows.
- Auto-restart of foreground servers.
