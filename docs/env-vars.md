# Workspace environment variables

Per-workspace environment variables and secrets, made available to **widget
server functions** and to **the agent's tools** (e.g. Bash). This is how a TTS
widget gets an `ELEVENLABS_API_KEY`, or the agent gets a `NOTION_TOKEN`, without
the value ever touching the repo.

## For users

A workspace's effective env comes from two sources:

1. **Workspace `.env` files** — `.env` and `.env.local` in the workspace root
   (local wins). Inherited by default; can be toggled off per workspace.
2. **Custom secrets** — key/value pairs you set in moi's env settings. Stored
   securely outside the repo (OS keychain when available, else a `0600` file).

Custom secrets win over `.env` for the same key. There is **one** effective env
per workspace — every key flows to widgets, the agent, and `moi env exec`
alike.

Things you can control per workspace (via the env settings UI →
`PUT /api/workspaces/:id/env`):

- **Add / update / remove custom secrets.** Values are write-only — the API
  never returns them back, so the UI shows `••••`, and editing means typing a
  new value.
- **Inherit `.env`** toggle. Off means `.env` files are ignored for injection
  (still shown in the UI and `moi env` for reference).

Widgets can also **declare** the keys they need via `config.requiredEnv` (see the
widgets skill). This is advisory: the settings UI and `moi env` surface which
required keys are unset, but nothing is enforced — a missing key is just
`undefined`.

Changes apply on the **next** widget call / agent message — no page refresh or
manual restart needed.

### The `moi env` CLI

The same model is accessible from the terminal. Every subcommand resolves the
workspace from **cwd** — the nearest registered workspace containing it, so
commands work from `.moi/` or any subdirectory — and errors with a hint when
cwd is outside every workspace. Secret **values are never printed**; the only
place a value becomes visible is inside a process launched via
`moi env exec`. Reads and `exec` need no running server.

- `moi env` — the effective env: key names with sources (`.env` file list /
  `custom` / a custom secret overriding `.env`), detected `.env` files with key
  counts (listed even when inheritance is off, marked disabled), required-key
  satisfaction (missing keys flagged with the widgets/views that declared
  them), and the secret backend.
- `moi env set KEY=value [KEY=value...]` — upsert custom secrets (the value
  is everything after the first `=`; several pairs apply as one write and one
  worker restart). A single bare `moi env set KEY` reads the value from
  stdin — hidden prompt on a TTY, piped input with one trailing newline
  trimmed — so humans can keep secrets out of shell history. Invalid key
  names and empty values are rejected, and a write that lands in the
  plaintext file fallback (no OS keychain) says so.
- `moi env unset KEY [KEY...]` — remove custom secrets. Dotenv-sourced keys
  are refused with a pointer to their file; removing a key that shadows a
  `.env` value un-shadows it; unknown keys warn without failing.
- `moi env exec -- <cmd> [args...]` — run a command with the workspace env
  overlaid on the inherited process env (workspace values win, re-resolved
  fresh on every run; auto-loaded `.env` values are scrubbed from the
  inherited env first, so the resolution is authoritative). The child's exit
  code is propagated. One caveat: a child that is itself `bun` re-reads `.env`
  from cwd on its own, which exec cannot prevent.

CLI writes notify a running server over the control port (`env:changed`) so
workers/sessions are reaped and the settings UI refetches, exactly like a
`PUT /env`; with no server running the write still lands and applies on the
next start.

### How it reaches code

- **Widgets**: read `process.env.X` inside `.server.ts` only. It runs in the
  function worker, never the browser, so secrets never enter the client bundle.
- **Agent**: injected into the agent subprocess env, so the Bash tool sees it.

### Defaults for a new workspace

Inherit `.env` is **on**, there are **no custom secrets**, and **nothing is
written to disk** until you set something. So a fresh workspace simply inherits
its `.env` and nothing else.

## Internals

### Resolution (`server/workspace-env.ts`)

`resolveWorkspaceEnv(workspacePath)` is the single source of truth:

```
base   = inheritDotenv ? parse(.env) ⊕ parse(.env.local) : {}
result = { ...base, ...customSecrets }     // custom wins
```

`.env` is parsed with `node:util`'s built-in `parseEnv` (no dependency).

### Storage: secrets vs metadata

Secret **values** and the **metadata** are stored separately, both keyed by
absolute workspace path, both outside the repo:

- **Metadata** → `<dataDir>/workspace-env.json`: just `inheritDotenv`. Not
  secret. (Older versions also stored a per-key `scopes` map here; stale
  entries are ignored and dropped on the next write.)
- **Secret values** → a `SecretStore`:
  - **Primary**: the OS keychain via `Bun.secrets` (macOS Keychain, libsecret,
    Windows Credential Manager). One JSON bag per workspace.
  - **Fallback**: `<dataDir>/workspace-secrets.json`, written `0600` in a `0700`
    dir, atomically (temp + rename). Used when no keyring is available
    (headless Linux, CI). Selected by a one-time non-mutating probe at first
    use; `MOI_SECRET_BACKEND=file` pins the fallback (tests, headless setups).

> The keychain gives **encryption at rest**, not process isolation — any
> same-user process can read it.

### Injection at spawn

Env is injected when a process is spawned and is **frozen** for that process's
lifetime:

- **Widget worker** (`server/functions.ts`): spawns with the resolved env. To
  stop Bun from _auto-loading_ the workspace `.env` (which would bypass the
  inherit toggle), the worker is spawned from a neutral cwd and `chdir`s back
  to the workspace root at startup (`MEI_WORKSPACE_ROOT`, see
  `server/functions-worker.ts`). moi's injected env is therefore authoritative.
- **Agent session** (`server/cc-session.ts`): spawns with the resolved env
  merged into the SDK `query()` `env`.

### Applying changes (no mid-turn reload)

Because env is frozen at spawn, every write path converges on
`applyEnvChanged` (`server/env-apply.ts`) — `PUT /env` directly, a CLI write
via its `env:changed` control message — which reaps the relevant processes so
the next call/message respawns with fresh env, and broadcasts `env:updated`
so every connected client refetches the view:

- `restartWorker(path)` — kills the cached widget worker; next RPC respawns it.
- `restartWorkspaceSessions(path)` — tears down **idle** agent sessions; busy
  ones keep their snapshot until the turn ends.

`moi env exec` sidesteps the freeze entirely: it re-resolves on every run, so
it always sees current values.

### `requiredEnv` flow

`config.requiredEnv` (widget `.tsx`) → parsed by `extractWidgetConfig`
(`build-widget.ts`) → stored in the widget manifest → `collectRequiredEnv`
(`widgets.ts`) + `collectViewRequiredEnv` (`views.ts`) → merged by
`requiredEnvFor` (`required-env.ts`) → surfaced in the env view with a
`satisfied` flag (computed against the effective env).

### API

`GET /api/workspaces/:id/env` → `WorkspaceEnvView` (`lib/types.ts`): the
effective vars with `source`, discovered `.env` files with counts,
`inheritDotenv`, the active `backend`, and `required` keys. **All values are
masked.**

`PUT /api/workspaces/:id/env` → patch semantics: `set` (upsert), `remove`,
`inheritDotenv`. Patch (not replace) because values are write-only. Triggers
the respawns above.

### Key files

| File                                          | Role                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `server/workspace-env.ts`                     | resolver, `SecretStore`, metadata, env view                               |
| `server/cli-env.ts`                           | `moi env` rendering, secret input, exec spawn, control-port notify        |
| `server/required-env.ts`                      | widget + view `requiredEnv` aggregation                                   |
| `server/functions.ts` / `functions-worker.ts` | widget worker spawn + env injection + neutral-cwd/chdir + `restartWorker` |
| `server/cc-session.ts`                        | agent session env injection + `restartWorkspaceSessions`                  |
| `server/control.ts`                           | `env:changed` handler (reap + `env:updated` broadcast)                    |
| `server/api.ts`                               | `GET`/`PUT /api/workspaces/:id/env`                                       |
| `lib/types.ts`                                | `WorkspaceEnvVar`, `WorkspaceEnvView`                                     |
