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

Custom secrets win over `.env` for the same key.

Things you can control per workspace (via the env settings UI →
`PUT /api/workspaces/:id/env`):

- **Add / update / remove custom secrets.** Values are write-only — the API
  never returns them back, so the UI shows `••••`, and editing means typing a
  new value.
- **Scope** each custom key to where it's allowed to flow: `widgets`, `agent`,
  or `both` (default). Use this to keep, say, a production token out of the
  agent's bypass-permissions Bash, or a widget-only key out of the agent.
- **Inherit `.env`** toggle. Off means `.env` files are ignored for injection
  (still shown in the UI for reference).

Widgets can also **declare** the keys they need via `config.requiredEnv` (see the
widgets skill). This is advisory: the settings UI surfaces which required keys
are unset, but nothing is enforced — a missing key is just `undefined`.

Changes apply on the **next** widget call / agent message — no page refresh or
manual restart needed.

### How it reaches code

- **Widgets**: read `process.env.X` inside `.server.ts` only. It runs in the
  function worker, never the browser, so secrets never enter the client bundle.
- **Agent**: injected into the agent subprocess env, so the Bash tool sees it.
- `.env` feeds both sinks; a custom secret feeds only the sink(s) its scope
  allows.

### Defaults for a new workspace

Inherit `.env` is **on**, there are **no custom secrets**, and **nothing is
written to disk** until you set something. So a fresh workspace simply inherits
its `.env` (to both widgets and the agent) and nothing else.

## Internals

### Resolution (`server/workspace-env.ts`)

`resolveWorkspaceEnv(workspacePath, sink)` is the single source of truth. It
merges, for the given sink (`'widgets'` | `'agent'`):

```
base   = inheritDotenv ? parse(.env) ⊕ parse(.env.local) : {}
custom = secrets where scope ∈ { both, <sink> }
result = { ...base, ...custom }            // custom wins
```

`.env` is parsed with `node:util`'s built-in `parseEnv` (no dependency).

### Storage: secrets vs metadata

Secret **values** and the **metadata** are stored separately, both keyed by
absolute workspace path, both outside the repo:

- **Metadata** → `<dataDir>/workspace-env.json`: just `inheritDotenv` and the
  per-key `scopes` map (key names double as the UI list). Not secret.
- **Secret values** → a `SecretStore`:
  - **Primary**: the OS keychain via `Bun.secrets` (macOS Keychain, libsecret,
    Windows Credential Manager). One JSON bag per workspace.
  - **Fallback**: `<dataDir>/workspace-secrets.json`, written `0600` in a `0700`
    dir, atomically (temp + rename). Used when no keyring is available
    (headless Linux, CI). Selected by a one-time non-mutating probe at first use.

> The keychain gives **encryption at rest**, not process isolation — any
> same-user process (including the agent) can read it. Keeping a secret away
> from the agent is done by **scoping**, not by storage.

### Injection at spawn

Env is injected when a process is spawned and is **frozen** for that process's
lifetime:

- **Widget worker** (`server/functions.ts`): spawns with the `'widgets'`
  resolution. To stop Bun from _auto-loading_ the workspace `.env` (which would
  bypass the inherit toggle and scoping), the worker is spawned from a neutral
  cwd and `chdir`s back to the workspace root at startup
  (`MEI_WORKSPACE_ROOT`, see `server/functions-worker.ts`). moi's injected env
  is therefore authoritative.
- **Agent session** (`server/cc-session.ts`): spawns with the `'agent'`
  resolution merged into the SDK `query()` `env`.

### Applying changes (no mid-turn reload)

Because env is frozen at spawn, a `PUT /env` reaps the relevant processes so the
next call/message respawns with fresh env:

- `restartWorker(path)` — kills the cached widget worker; next RPC respawns it.
- `restartWorkspaceSessions(path)` — tears down **idle** agent sessions; busy
  ones keep their snapshot until the turn ends.

### `requiredEnv` flow

`config.requiredEnv` (widget `.tsx`) → parsed by `extractWidgetConfig`
(`build-widget.ts`) → stored in the widget manifest → `collectRequiredEnv`
(`widgets.ts`) maps key → widgets → surfaced in the env view with a `satisfied`
flag (computed against what's visible to the `widgets` sink).

### API

`GET /api/workspaces/:id/env` → `WorkspaceEnvView` (`lib/types.ts`): the
effective vars with `source` + `scope`, discovered `.env` files with counts,
`inheritDotenv`, the active `backend`, and `required` keys. **All values are
masked.**

`PUT /api/workspaces/:id/env` → patch semantics: `set` (upsert), `remove`,
`scopes`, `inheritDotenv`. Patch (not replace) because values are write-only.
Triggers the respawns above.

### Key files

| File                                          | Role                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `server/workspace-env.ts`                     | resolver, `SecretStore`, metadata, env view                               |
| `server/functions.ts` / `functions-worker.ts` | widget worker spawn + env injection + neutral-cwd/chdir + `restartWorker` |
| `server/cc-session.ts`                        | agent session env injection + `restartWorkspaceSessions`                  |
| `server/widgets.ts`                           | `collectRequiredEnv`, `requiredEnv` in manifest                           |
| `server/build-widget.ts`                      | `requiredEnv` extraction                                                  |
| `server/web.ts`                               | `GET`/`PUT /api/workspaces/:id/env`                                       |
| `lib/types.ts`                                | `EnvScope`, `WorkspaceEnvVar`, `WorkspaceEnvView`                         |
