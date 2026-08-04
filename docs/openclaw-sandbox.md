# Running OpenClaw in Claude Code on the web

> Bringing up a real OpenClaw gateway inside the cloud sandbox so the
> `server/harness/openclaw/` integration can be exercised end to end.
> Verified against the pinned `openclaw@2026.7.1` (2026-08-04). Protocol and
> RPC details live in `server/harness/openclaw/NOTES.md`; this doc is only the
> sandbox bring-up.

## Node: the sandbox runtime is one patch too old

The sandbox ships Node v22.22.2 at `/opt/node22`; openclaw refuses anything
below 22.22.3 / 24.15 / 25.9. The floor is real, not cosmetic — older
`node:sqlite` embeds a SQLite with a WAL-reset corruption bug, and openclaw
also refuses Bun as the gateway runtime (Bun reports v24.3.0). nvm is
preinstalled and nodejs.org is reachable through the egress relay:

```sh
nvm install 24 && nvm alias default 24
export PATH="$(ls -d "$HOME"/.nvm/versions/node/v24.*/bin | tail -1):$PATH"
```

`/opt/node22/bin` stays first in `PATH` in fresh shells, so repeat the
`export PATH` prepend in every shell that runs `openclaw`.

## Per session

State lives in `~/.openclaw/` and dies with the container — rerun this each
session:

```sh
bun install                              # brings the pinned openclaw dep
echo "{ gateway: { mode: 'local', port: 18789, auth: { mode: 'token', token: '$(openssl rand -hex 24)' } } }" \
  | node_modules/.bin/openclaw config patch --stdin
node_modules/.bin/openclaw gateway       # foreground — run_in_background; ready in ~2 s
curl -s http://127.0.0.1:18789/health    # {"ok":true,"status":"live"}
bun server/cli.ts openclaw init main     # install moi skills into the agent workspace
```

A default `main` agent (workspace `~/.openclaw/workspace`) exists out of the
box. `discoverOpenClawAgents()` works immediately: connecting over loopback
with the gateway token gets full operator scopes on a fresh install, so the
device-approval dance in NOTES.md §3 does not bite here.

## Model auth — the one thing the sandbox cannot self-serve

The environment carries no model provider credential, so agent turns fail
until one is added (`openclaw models status` → `missing auth`). Shell env
keys are off by default; the verified path is the auth store:

```sh
printf '%s' "$KEY" | node_modules/.bin/openclaw models auth paste-api-key --provider anthropic
node_modules/.bin/openclaw models set anthropic/claude-sonnet-5
```

`openclaw models list --all` shows the catalog ids (`anthropic/…`,
`openai/…`). Keys land in the per-agent auth store under
`~/.openclaw/agents/main/agent/`. Restart the gateway afterwards — the
default model is resolved at startup.

`openclaw models auth login --provider <p>` is the interactive OAuth
alternative; in a headless sandbox an API key is simpler.

## Gotchas

- Restart the gateway after any `openclaw config` write — config is read at
  start.
- The CLI wrapper detaches the real server as a process named
  `openclaw-gateway`, so killing the wrapper leaves the gateway (and its
  stale in-memory config) running. Stop it with `pkill -f openclaw-gateway`
  and confirm the port is free before relaunching.
- moi reads `~/.openclaw/openclaw.json` (the real profile). `openclaw --dev`
  isolates under `~/.openclaw-dev/` on port 19001, which moi will not see.
- `registry.npmjs.org`, `nodejs.org`, and `api.anthropic.com` are all
  reachable through the egress relay; `github.com` browsing is not (git goes
  through the git proxy).
