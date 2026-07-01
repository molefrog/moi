# Browser-testing moi in sandboxed cloud environments

> How to load and drive the moi app in a real Chromium inside Claude Code on
> the web (and similar sandboxes), with Playwright or agent-browser. Verified
> working end to end. Since React became vendored (`client/vendor/react`,
> served same-origin at `/vendor/react/*`), the app needs **zero external
> network** in the browser — no special flags, mirrors, or cert tricks.

## Container preinstall

Claude Code environments support a preinstall/setup script. Adding this there
saves a step per session:

```sh
npm i -g agent-browser   # CLI only — do NOT run `agent-browser install`,
                         # its Chrome download fails behind the egress relay;
                         # the system Chromium at /opt/pw-browsers is used instead
```

The repo also vendors the agent-browser usage skill at
`.claude/skills/agent-browser/`, so agents get the command reference without
network access (`agent-browser skills get core --full` prints the copy
matching the installed CLI, if they differ).

## Setup (once per session)

```sh
bun install
bun server/cli.ts init /tmp/test-ws        # register a scratch workspace
bun run dev &                              # moi on http://127.0.0.1:3000
```

Get the workspace id from `curl -s http://127.0.0.1:3000/api/workspaces`.
The chat lives at `http://127.0.0.1:3000/workspace/<id>`.

In the Claude Code cloud sandbox the server must be started via the Bash
tool's `run_in_background` (detached processes get reaped).

## Driving with Playwright

Chromium is preinstalled at `/opt/pw-browsers/chromium`; the global playwright
package lives at `/opt/node22/lib/node_modules/playwright` (import it by
absolute path — it's not resolvable from arbitrary cwds). A vanilla launch
works:

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
await page.goto('http://127.0.0.1:3000/workspace/<id>', { waitUntil: 'load' })
```

Don't wait for `networkidle` — the app holds a WebSocket open; use `load`.

## Driving with agent-browser

One env var, then the normal snapshot/ref loop (see
`.claude/skills/agent-browser/SKILL.md`):

```sh
export AGENT_BROWSER_EXECUTABLE_PATH=/opt/pw-browsers/chromium

agent-browser open http://127.0.0.1:3000/workspace/<id>
agent-browser snapshot          # a11y tree with refs
agent-browser screenshot /tmp/shot.png
```

The daemon freezes the environment of whichever CLI call spawns it. If it was
started with wrong options, `agent-browser close` (or
`pkill -f agent-browser-linux`) before retrying — new env vars are silently
ignored while a daemon lives.

## If the browser ever needs an external host

It can't reach one directly: the sandbox's egress relay (the `HTTPS_PROXY`
CONNECT proxy) closes BoringSSL-style TLS ClientHellos, which kills Chromium
_and_ Bun's `fetch` mid-handshake (`ERR_CONNECTION_CLOSED`) regardless of
proxy or certificate flags — it's not a trust problem, and post-quantum/ECH
tweaks don't help. OpenSSL clients (curl, Node) pass fine through the same
relay. If a future feature makes the page fetch an external host, mirror that
host locally from a Node process and remap it with
`--host-resolver-rules="MAP <host> 127.0.0.1" --no-proxy-server` — git
history has a working reference (`scripts/esm-mirror.mjs`, removed when React
became vendored). Also note Chromium on Linux silently adopts `HTTPS_PROXY`
from the environment, and Playwright's `proxy:` option force-appends
`<-loopback>`, which routes even `127.0.0.1` through the relay.

## The dev `process.env` gotcha

Bun's dev bundler snapshots `process.env` when the server process starts;
bunfig's `[serve.static] env = "PUBLIC_*"` inlining only sees vars set before
spawn, so setting one from server code does nothing and a bare
`process.env.…` reference survives into the browser bundle and throws
`process is not defined`. That's why the CLI launcher (`server/cli.ts`)
defaults `PUBLIC_TLDRAW_LICENSE_KEY` in the spawn env, and
`client/components/Scratchpad.tsx` guards the read.
