# `moi env` — CLI spec

Give the agent (and users) visibility into a workspace's environment from the
terminal. The agent runs inside the workspace with Bash access but today has no
way to answer "which env keys exist here?", "why is this widget missing its
API key?", or "how do I run a script with the workspace env?" without guessing.

This is a CLI face over the existing env model (`server/workspace-env.ts`,
see `docs/env-vars.md`) — no new storage, no new resolution semantics.

**Secret values are never printed.** Every subcommand deals in key names,
sources, and scopes only. The single place a value becomes visible is inside a
process the user explicitly launches via `moi env exec`.

## Commands

### `moi env`

Renders the workspace's effective env state — the same data as
`GET /api/workspaces/:id/env` (`WorkspaceEnvView`), as a plain-text table:

```
Workspace: ~/projects/acme  (acme)

.env files   inherited: on
  .env         4 keys
  .env.local   2 keys

KEY                 SOURCE             SCOPE
ANTHROPIC_API_KEY   custom             both
DATABASE_URL        .env
ELEVENLABS_API_KEY  custom             widgets
OPENAI_API_KEY      .env, .env.local

Required by widgets/views
  ✓ OPENAI_API_KEY      tts
  ✗ WEATHER_TOKEN       missing — required by weather

Secrets stored in: OS keychain
```

- **Vars table**: every effective key with its `source` (`.env` file list /
  `custom` / both — a custom secret shadowing a `.env` key shows both) and, for
  custom keys, the sink `scope`. No values, no masked previews.
- **Dotenv state**: detected `.env` files with key counts. When `inheritDotenv`
  is off, the files are still listed but the section reads
  `inherited: off (disabled in settings — keys not injected)` and dotenv-only
  keys drop out of the vars table, matching what actually gets injected.
- **Required-env diagnostics**: keys declared via `config.requiredEnv` by
  widgets/views, with a satisfied/missing flag and which widgets asked. This is
  the heart of agent visibility — the agent can self-diagnose a failing widget
  ("missing `WEATHER_TOKEN`") and tell the user exactly which key to add.
- **Backend line**: keychain vs `0600`-file fallback, same as the settings UI.

No `--json` flag — the plain print is the interface (v1).

### `moi env set KEY=value` / `moi env set KEY`

Upserts a **custom secret** (moi's own env — never touches `.env` files).

- `moi env set KEY=value` — inline form, for scripting and agent use. The value
  is everything after the first `=` (values may contain `=`).
- `moi env set KEY` — no `=`: read the value from stdin. On a TTY, prompt with
  hidden input; when piped, consume stdin and trim a single trailing newline.
  This keeps secrets out of shell history for humans.
- Key must pass `isValidEnvKey` (POSIX-ish name); reject otherwise, exit 1.
- New keys get the default scope `both`. There is **no `--scope` flag** —
  scopes are managed in the settings UI only.
- Values are write-only, consistent with the API: the command confirms
  (`Set FOO (custom, scope: both)`) without echoing the value.

### `moi env unset KEY [KEY...]`

Removes custom secrets (maps to the module's `remove`). Only custom keys can be
removed — a dotenv-sourced key errors with a pointer to the `.env` file it
lives in. Unsetting a key that shadows a `.env` value un-shadows it; the
confirmation says so. Unknown keys warn but don't fail the whole invocation.

### `moi env exec [--sink widgets] -- <cmd> [args...]`

Runs a command with the workspace env applied — the way to run a script or
one-off tool with fresh env (the agent's own session env is frozen at spawn).

- Env = `{ ...process.env, ...resolveWorkspaceEnv(path, sink) }`. Workspace env
  wins over inherited process env, so re-resolved values override the agent
  session's stale snapshot.
- **Default sink is `agent`**: `.env` (when inherited) + custom keys scoped
  `agent`/`both`. Widgets-only secrets are *not* injected — the agent is the
  primary caller, and injecting everything would let
  `moi env exec -- printenv` defeat the scope feature.
- `--sink widgets` switches to the widgets resolution, for humans testing
  widget server code from a terminal.
- Spawns in the current cwd, inherits stdio, propagates the child's exit code.
  Missing `--` or empty command → usage error.

Caveat (documented, not solved): if the child is itself `bun` running from the
workspace root, Bun auto-loads `.env` from cwd, which can bypass
`inheritDotenv: off` and shadow scoping for dotenv keys. Same class of issue
the function worker solves with its neutral-cwd trick; out of scope for the
CLI — `exec` controls injection, not what the child runtime reads off disk.

## Workspace resolution

All subcommands resolve the workspace from **cwd**: nearest registered
workspace containing cwd (`findWorkspaceForPath` over the registry, same
semantics as `control.ts#resolveWorkspace` — works from `.moi/` or any
subdirectory). If cwd isn't inside any registered workspace, exit 1 with
`… is not inside a registered moi workspace. Open it in moi, or run from the
workspace root.` No `--workspace` flag in v1.

The registry (`workspaces.json`), env metadata, and secret store are all plain
files/keychain in the OS data dir, so **reads and `exec` need no running
server**.

## Server coordination on writes

Env is frozen at spawn; the API's `PUT /env` reaps the function worker and idle
agent sessions so the next call picks up changes. The CLI mirrors that:

1. `set`/`unset` write **directly** via `updateWorkspaceEnv` (works with the
   server down; `withWriteLock` only serializes within one process, but the
   server never writes except on an explicit `PUT`, so cross-process races are
   not a practical concern).
2. Then, if a server is running (`isServerRunning`), send a new control-port
   message `{ type: 'env:changed', path }`. The handler in `server/control.ts`
   resolves the workspace, calls `restartWorker(path)` +
   `restartWorkspaceSessions(path)`, and publishes a live event so the settings
   UI refetches the env view. When no server is running, skip silently — the
   next server start resolves fresh env anyway.

## Non-goals (v1)

- Editing scopes from the CLI (`--scope`) — UI only; new keys default `both`.
- Toggling `inheritDotenv` from the CLI — UI only; state is displayed.
- `--json` output.
- Value peeking, even masked previews (`sk-…3f2`).
- Multi-workspace flags / operating on a workspace other than cwd's.
- Staleness warnings in `moi env` output.

## Touch points

| File                      | Change                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `server/cli.ts`           | new `env` command group (`env`, `set`, `unset`, `exec`), registered in `main.subCommands`                    |
| `server/cli-env.ts` (new) | table rendering + stdin/prompt input + exec spawn, keeping `cli.ts` from growing another 300 lines           |
| `server/control.ts`       | `env:changed` handler → reap worker + idle sessions, publish live event                                      |
| `server/workspace-env.ts` | reused as-is (`getWorkspaceEnvView`, `updateWorkspaceEnv`, `resolveWorkspaceEnv`)                            |
| `server/api.ts`           | extract `requiredEnvFor` (widget + view `requiredEnv` aggregation) into a shared helper the CLI reuses       |
| `docs/env-vars.md`        | short "CLI" section linking here                                                                             |

## Details

- Exit codes: 0 on success; 1 on usage/validation/unregistered-workspace
  errors; `exec` returns the child's exit code.
- Output styling follows existing CLI conventions (`picocolors`, the `columns`
  helper used by `moi openclaw`/`status` tables).
- Tests: `server/test/workspace-env.test.ts` already covers the model; add CLI
  tests for workspace resolution, set/unset round-trip (file backend), and
  exec sink filtering.
