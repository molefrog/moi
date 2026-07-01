# Browser-testing moi in sandboxed cloud environments

> How to load and drive the moi app in a real Chromium inside Claude Code on
> the web (and similar sandboxes), with Playwright or agent-browser. Verified
> working end to end; every claim below was established empirically in such an
> environment. Helper: `scripts/esm-mirror.mjs`.

## The two obstacles

1. **The client needs esm.sh.** `client/index.html` loads React through an
   import map pointing at `https://esm.sh/react@19?dev` etc. No network → a
   blank page with `Failed to fetch dynamically imported module`.
2. **The sandbox's egress relay kills the browser's TLS.** Outbound HTTPS is
   forced through a TLS-intercepting proxy (`HTTPS_PROXY`, CONNECT-only). The
   relay accepts the tunnel, then closes the socket on Chromium's TLS
   ClientHello (`ERR_CONNECTION_CLOSED` mid-handshake). Bun's `fetch` dies the
   same way (both are BoringSSL); **OpenSSL clients pass** — curl and Node
   fetch the same URLs fine through the same proxy. No browser flag fixes
   this: it's not a trust problem (`--ignore-certificate-errors` doesn't
   help), not post-quantum ClientHello size, not ECH.

So the browser must never talk to the outside world at all. Instead:

- `scripts/esm-mirror.mjs` (Node, OpenSSL) serves `https://esm.sh/*` from
  127.0.0.1:443, fetching upstream through the proxy and caching on disk.
- Chromium gets `--host-resolver-rules="MAP esm.sh 127.0.0.1"` (DNS-level
  remap, keeps port 443 — the mirror must listen on 443) and
  `--no-proxy-server` (Chromium on Linux silently adopts `HTTPS_PROXY` from
  the environment; with a proxy active the resolver rules never apply, since
  hostnames go to the proxy unresolved).
- The mirror's cert is self-signed → ignore HTTPS errors in the driver.

## Setup (once per session)

```sh
bun install
bun server/cli.ts init /tmp/test-ws        # register a scratch workspace
node scripts/esm-mirror.mjs &              # 127.0.0.1:443, needs root for 443
bun run dev &                              # moi on http://127.0.0.1:3000
```

Get the workspace id from `curl -s http://127.0.0.1:3000/api/workspaces`.
The chat lives at `http://127.0.0.1:3000/workspace/<id>`.

In the Claude Code cloud sandbox both servers must be started via the Bash
tool's `run_in_background` (detached processes get reaped).

## Driving with Playwright

Chromium is preinstalled at `/opt/pw-browsers/chromium`; the global playwright
package lives at `/opt/node22/lib/node_modules/playwright` (import it by
absolute path — it's not resolvable from arbitrary cwds).

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-proxy-server', '--host-resolver-rules=MAP esm.sh 127.0.0.1']
})
const page = await browser.newPage({ ignoreHTTPSErrors: true })
await page.goto('http://127.0.0.1:3000/workspace/<id>', { waitUntil: 'load' })
```

Notes:

- Don't use Playwright's `proxy:` launch option to reach the egress proxy —
  it force-appends `<-loopback>` to the bypass list, which routes
  `127.0.0.1:3000` through the CONNECT-only relay (405s). Not needed anyway:
  with the mirror, the browser needs zero external network.
- Don't wait for `networkidle` — the app holds a WebSocket open; use `load`.

## Driving with agent-browser

`npm i -g agent-browser` works; its own Chrome download does not (same relay
problem) — point it at the system Chromium instead. Its daemon inherits the
environment of the **first** CLI call, so set everything up front, in every
shell that might spawn the daemon:

```sh
unset HTTPS_PROXY https_proxy HTTP_PROXY http_proxy ALL_PROXY NO_PROXY no_proxy
export AGENT_BROWSER_EXECUTABLE_PATH=/opt/pw-browsers/chromium
export AGENT_BROWSER_IGNORE_HTTPS_ERRORS=1
export AGENT_BROWSER_ARGS='--no-proxy-server
--host-resolver-rules=MAP esm.sh 127.0.0.1'

agent-browser open http://127.0.0.1:3000/workspace/<id>
agent-browser snapshot          # a11y tree with refs
agent-browser screenshot /tmp/shot.png
```

Pitfalls (each one cost real debugging time):

- **Unset the proxy env vars.** agent-browser reads `HTTPS_PROXY` and applies
  it to its browser, which both breaks the resolver mapping and routes local
  traffic into the relay.
- If a daemon is already running with wrong options, `agent-browser close`
  (or `pkill -f agent-browser-linux`) before retrying — new env/flags are
  ignored while a daemon lives, and a half-dead daemon respawns with whatever
  environment the next CLI call has.
- `agent-browser connect <port>` (CDP attach to a separately-launched
  Chromium) is unreliable in this setup — the daemon has been observed
  spawning its own browser regardless. Launching through the daemon with
  `AGENT_BROWSER_ARGS` is the path that works.

## What was fixed in the app itself

`process is not defined` used to crash the app in dev. Bun's dev bundler
snapshots `process.env` when the server process starts; bunfig's
`[serve.static] env = "PUBLIC_*"` inlining only sees vars set before spawn,
so `web.ts` defaulting `PUBLIC_TLDRAW_LICENSE_KEY` at module scope did
nothing and the bare `process.env.…` reference survived into the browser
bundle. Fixed by defaulting the var in the CLI launcher's spawn env
(`server/cli.ts`) and hardening the read in `Scratchpad.tsx`. No init-script
shim is needed.
