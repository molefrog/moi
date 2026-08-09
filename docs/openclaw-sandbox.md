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

Provider ids come from `openclaw models list --all | awk '{print $1}' | cut -d/ -f1 | sort -u`
— they are not always what you'd guess (Ollama's cloud models sit under
`ollama-cloud`, not `ollama`). Two providers are enough to cover the
interesting differences: one that streams reasoning text and one that doesn't.

`claude-cli/*` models shell out to the `claude` binary, which refuses
`--dangerously-skip-permissions` when running as root — so those runs fail in
this sandbox with `chain_exhausted` no matter how the model is authenticated.
That failure is still useful: it is how the run-error reporting path was
verified.

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

## Recording a run

Record real traffic before changing how frames are interpreted — the recorded
orders are what caught the duplicate-tool-card bug that a hand-written unit test
had been asserting was correct.

There is no checked-in tool for this; a throwaway script is a dozen lines.
Connect with the harness's own options so the connection is identical to moi's:

```ts
import { gatewayClientBaseOptions } from '@/server/harness/openclaw/gateway'

const { GatewayClient } = await import('openclaw/plugin-sdk/gateway-runtime')
const client = new GatewayClient({
  ...gatewayClientBaseOptions(`ws://127.0.0.1:${port}`, token),
  onHelloOk: () => {},
  onEvent: evt => appendFileSync(out, `${JSON.stringify(evt)}\n`)
})
```

`caps: ['tool-events']` (which `gatewayClientBaseOptions` sets) is load-bearing:
without it the gateway sends no tool frames at all and the capture looks like a
backend that has none. Then `sessions.create` → `sessions.subscribe` →
`sessions.messages.subscribe` → `sessions.send`, wait for the `agent`/lifecycle
`end` frame, and finish with `sessions.get` for the durable transcript.

Two audiences are worth recording separately: the connection that sends gets
`agent`/tool frames, while a second connection that only subscribes gets the
same payloads as `session.tool` (NOTES.md §6).

Prompts worth capturing: one tool call (the owner row and the tool frame race,
~4ms apart), several calls fanned out of one row, and a run that fails.

## Multi-version test rig

Used to verify the protocol-4 compatibility claims in
`server/harness/openclaw/NOTES.md` (2026-08-04). Old gateway versions run
side by side with the pinned one — profiles isolate state, scratch npm
installs isolate code:

- `npm install openclaw@<version>` into a scratch dir per version
  (`<scratchpad>/run-2026.6.33/`, `<scratchpad>/run-2026.4.22/`), using the
  nvm Node from the section above.
- `--profile <name>` isolates everything: state root `~/.openclaw-<name>`,
  own config, agents, sessions. Patch each profile's gateway port before
  launch (same `config patch` recipe as "Per session", plus
  `--profile <name>`). The rig used: `--profile v633` → `~/.openclaw-v633`,
  port 19003; `--profile v422` → `~/.openclaw-v422`, port 19004; the pinned
  2026.7.1 gateway stays on 18789 with `~/.openclaw`.
- Launch: `run-<version>/node_modules/.bin/openclaw --profile <name> gateway`
  in the background. The detached `openclaw-gateway` process gotcha above
  applies per profile.

Probe scripts (session scratchpad, both take `<port> <token>`):

- `probe-compat.ts` — connects moi's pinned SDK client
  (`openclaw/plugin-sdk/gateway-runtime` from `node_modules`) to an arbitrary
  gateway and replays every RPC moi issues, printing hello-ok info and
  per-RPC ok/err. Verified protocol-4 parity on 2026.6.33 (every RPC moi
  uses answers shape-identically, hello reports protocol 4) and the
  protocol-3 handshake rejection on 2026.4.22 (`protocol mismatch` — the
  exact string `compat.ts → classifyGatewayError` keys on).
- `dump-events-port.ts` — subscribes, sends one message, and captures every
  event frame to JSONL; produced the live-event skeletons and the
  6.33-vs-7.1 wire-parity evidence in NOTES.md §6. It spends real tokens on
  gateways with model auth — point it only at rigs whose keys you own.
