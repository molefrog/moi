# `moi env` — CLI spec

Give the agent (and users) visibility into a workspace's environment from the
terminal. The agent runs inside the workspace with Bash access but today has no
way to answer "which env keys exist here?", "why is this widget missing its
API key?", or "how do I run a script with the workspace env?" without guessing.

This is a CLI face over the existing env model (`server/workspace-env.ts`,
see `docs/env-vars.md`) — no new storage, no new resolution semantics.

**Secret values are never printed.** Every subcommand deals in key names and
sources only. The single place a value becomes visible is inside a process the
user explicitly launches via `moi env exec`.

## Scope removal (prerequisite)

The per-key sink scope system (`widgets` / `agent` / `both`) is **dropped
entirely** as part of this work — there is one effective env, and every key
flows to every sink (widgets, agent, exec). Concretely:

- `resolveWorkspaceEnv(path)` loses its `sink` parameter; both spawn sites
  (`functions.ts`, `cc-session.ts`) get the same resolution.
- `EnvScope`, the `scopes` metadata map, `scopeOf`, and scope validation are
  deleted from `workspace-env.ts` / `lib/types.ts`. Existing `scopes` entries
  in `workspace-env.json` are simply ignored (stale metadata, harmless).
- `PUT /api/workspaces/:id/env` drops the `scopes` field; `WorkspaceEnvVar`
  drops `scope`.
- The settings UI removes the scope selector.
- `requiredEnv` satisfaction is computed against the single effective env.
- `docs/env-vars.md` is updated to match.

## Commands

### `moi env`

Renders the workspace's effective env state — the same data as
`GET /api/workspaces/:id/env` (`WorkspaceEnvView`), as a plain-text table:

```
Workspace: ~/projects/acme  (acme)

.env files   inherited: on
  .env         4 keys
  .env.local   2 keys

KEY                 SOURCE
ANTHROPIC_API_KEY   custom
DATABASE_URL        .env
ELEVENLABS_API_KEY  custom
OPENAI_API_KEY      .env, .env.local

Required by widgets/views
  ✓ OPENAI_API_KEY      tts
  ✗ WEATHER_TOKEN       missing — required by weather

Secrets stored in: OS keychain
```

- **Vars table**: every effective key with its `source` (`.env` file list /
  `custom` / both — a custom secret shadowing a `.env` key shows both). No
  values, no masked previews.
- **Dotenv state**: detected `.env` files with key counts. When `inheritDotenv`
  is off, the files are still listed but the section reads
  `inherited: off (disabled in settings — keys not injected)` and dotenv-only
  keys drop out of the vars table, matching what actually gets injected.
- **Required-env diagnostics**: keys declared via `config.requiredEnv` by
  widgets/views, with a satisfied/missing flag and which widgets asked. This is
  the heart of agent visibility — the agent can self-diagnose a failing widget
  ("missing `WEATHER_TOKEN`") and tell the user exactly which key to add.
- **Backend line**: keychain vs `0600`-file fallback, same as the settings UI.

No `--json` flag — the plain print is the interface. Toggling `inheritDotenv`
stays UI-only; the CLI just displays its state.

### `moi env set KEY=value` / `moi env set KEY`

Upserts a **custom secret** (moi's own env — never touches `.env` files).

- `moi env set KEY=value` — inline form, for scripting and agent use. The value
  is everything after the first `=` (values may contain `=`).
- `moi env set KEY` — no `=`: read the value from stdin. On a TTY, prompt with
  hidden input; when piped, consume stdin and trim a single trailing newline.
  This keeps secrets out of shell history for humans.
- Key must pass `isValidEnvKey` (POSIX-ish name); reject otherwise, exit 1.
- Values are write-only, consistent with the API: the command confirms
  (`Set FOO (custom)`) without echoing the value.

### `moi env unset KEY [KEY...]`

Removes custom secrets (maps to the module's `remove`). Only custom keys can be
removed — a dotenv-sourced key errors with a pointer to the `.env` file it
lives in. Unsetting a key that shadows a `.env` value un-shadows it; the
confirmation says so. Unknown keys warn but don't fail the whole invocation.

### `moi env exec -- <cmd> [args...]`

Runs a command with the workspace env applied — the way to run a script or
one-off tool with fresh env (the agent's own session env is frozen at spawn).

- Env = `{ ...process.env, ...resolveWorkspaceEnv(path) }`. Workspace env wins
  over inherited process env, so re-resolved values override the agent
  session's stale snapshot.
- Injects the one effective env: `.env` (when inherited) + all custom secrets.
- Spawns in the current cwd, inherits stdio, propagates the child's exit code.
  Missing `--` or empty command → usage error.

Caveat (documented, not solved): if the child is itself `bun` running from the
workspace root, Bun auto-loads `.env` from cwd, which can bypass
`inheritDotenv: off` for dotenv keys. Same class of issue the function worker
solves with its neutral-cwd trick; out of scope for the CLI — `exec` controls
injection, not what the child runtime reads off disk.

## Workspace resolution

All subcommands resolve the workspace from **cwd**: nearest registered
workspace containing cwd (`findWorkspaceForPath` over the registry, same
semantics as `control.ts#resolveWorkspace` — works from `.moi/` or any
subdirectory). If cwd isn't inside any registered workspace, exit 1 with
`… is not inside a registered moi workspace. Open it in moi, or run from the
workspace root.` No `--workspace` flag — cwd is the only selector.

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

## Skill changes (`moi-workspace`)

The agent learns about env through the workspace skill
(`workspace/.claude/skills/moi-workspace/SKILL.md`). Today its
"Environment & secrets" section only covers applet authoring (`process.env` in
`.server.ts`, advisory `requiredEnv`) — the agent has no way to _discover_ what
keys exist or run scripts with the env. Ship the skill update with the feature
(bump the `<moi-skill version>` marker so `moi skill` flags drift).

Two real workflows the skill must produce:

1. **"Pull my Notion pages"** → agent runs `moi env`, sees `NOTION_TOKEN` in
   `.env`, tells the user "using `NOTION_TOKEN` from `.env`", and runs its
   script via `moi env exec -- bun script.ts`.
2. **"Build me a weather widget"** → agent runs `moi env`, key isn't there →
   tells the user to add `WEATHER_TOKEN` in the workspace env settings, and
   still wires the widget (`config.requiredEnv: ['WEATHER_TOKEN']`, handles the
   missing key) so it lights up once the user sets it.

Concrete edits:

- Add to the `moi` CLI command list:

  > - `moi env` — list available env keys and where they come from (never
  >   values); `moi env exec -- <cmd>` runs a command with the workspace env

- Replace the "Environment & secrets" section body with (keeping the existing
  `process.env`-in-`.server.ts` paragraph and code sample at the end):

  > Each workspace has an effective env: keys from the project's `.env` /
  > `.env.local` (when inheritance is enabled in settings) plus **custom
  > secrets** the user manages in the workspace env settings. moi injects it
  > into your shell and into applet `.server.ts` functions.
  >
  > - **Check before you assume.** When a task needs a key or token — an API
  >   pull, a widget calling a service — run `moi env` first. It lists key
  >   names with their source (`.env` / custom) and flags declared
  >   `requiredEnv` keys that are missing. Values are never shown.
  > - **Key present** → say which key you'll use and where it's from ("using
  >   `NOTION_TOKEN` from `.env`") and proceed. To run a script or one-off
  >   command with the workspace env, use `moi env exec -- bun script.ts` —
  >   it also picks up values changed after your session started.
  > - **Key missing** → never invent or hardcode a value, and don't edit
  >   `.env` yourself. Tell the user the exact key name to add in the
  >   workspace env settings. Still build and wire the applet: declare the key
  >   in `config.requiredEnv` and handle its absence, so it works the moment
  >   the user sets it. If the user pastes a value in chat, store it with
  >   `moi env set KEY=value` (`moi env unset KEY` removes it).
  > - **Never print secret values** — not in chat, not in logs. Refer to keys
  >   by name only.

## Touch points

| File                                              | Change                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `server/workspace-env.ts`                         | remove sink/scope system (`resolveWorkspaceEnv(path)`, no `scopes` metadata); rest reused as-is    |
| `lib/types.ts`                                    | delete `EnvScope`; drop `scope` from `WorkspaceEnvVar`                                             |
| `server/api.ts`                                   | drop `scopes` from `PUT /env`; extract `requiredEnvFor` into a shared helper the CLI reuses        |
| `client/` env settings                            | remove the scope selector                                                                          |
| `server/cli.ts`                                   | new `env` command group (`env`, `set`, `unset`, `exec`), registered in `main.subCommands`          |
| `server/cli-env.ts` (new)                         | table rendering + stdin/prompt input + exec spawn, keeping `cli.ts` from growing another 300 lines |
| `server/control.ts`                               | `env:changed` handler → reap worker + idle sessions, publish live event                            |
| `docs/env-vars.md`                                | remove scoping docs; add a short "CLI" section linking here                                        |
| `workspace/.claude/skills/moi-workspace/SKILL.md` | env discovery guidance + `moi env` in the CLI list (see Skill changes); bump `<moi-skill version>` |

## Details

- Exit codes: 0 on success; 1 on usage/validation/unregistered-workspace
  errors; `exec` returns the child's exit code.
- Output styling follows existing CLI conventions (`picocolors`, the `columns`
  helper used by `moi openclaw`/`status` tables).
- Tests: update `server/test/workspace-env.test.ts` for the scope removal; add
  CLI tests for workspace resolution, set/unset round-trip (file backend), and
  exec env injection.
