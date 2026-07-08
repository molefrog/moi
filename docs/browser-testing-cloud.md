# Browser-testing moi in Claude Code on the web

> Driving the app in a real Chromium inside the cloud sandbox, with Playwright
> or agent-browser. React is vendored (served same-origin at `/vendor/react/*`),
> so the browser needs no external network — vanilla launches work.

The environment preinstalls everything (deps, agent-browser CLI, the
executable-path env var). Never run `agent-browser install` — its Chrome
download fails behind the sandbox's egress relay; the preinstalled Chromium
at `/opt/pw-browsers/chromium` is used instead.

## Per session

```sh
bun server/cli.ts init /tmp/test-ws     # register a scratch workspace
bun run dev                             # port 13337 — use run_in_background,
                                        # detached processes get reaped
```

Workspace id: `curl -s http://127.0.0.1:13337/api/workspaces`. The chat lives
at `http://127.0.0.1:13337/workspace/<id>`.

## Playwright

The global playwright package is at `/opt/node22/lib/node_modules/playwright`
— import it by absolute path, it isn't resolvable from arbitrary cwds.

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
await page.goto('http://127.0.0.1:13337/workspace/<id>', { waitUntil: 'load' })
```

Wait for `load`, not `networkidle` — the app holds a WebSocket open.

## agent-browser

Usage (snapshot/ref loop, commands, troubleshooting) is covered by the
vendored skill — `.agents/skills/agent-browser/`. `agent-browser open <url>`
just works: the environment presets `AGENT_BROWSER_EXECUTABLE_PATH` to the
system Chromium. (The daemon freezes its env at spawn — if it somehow started
without the var, `agent-browser close` and retry.)

## Appendix: external hosts & the egress relay

The browser cannot fetch external hosts: the sandbox relay (`HTTPS_PROXY`,
CONNECT-only) closes BoringSSL TLS ClientHellos mid-handshake
(`ERR_CONNECTION_CLOSED`) — Chromium and Bun's `fetch` both fail, regardless
of proxy/cert flags, while OpenSSL clients (curl, Node) pass. If a feature
ever needs the page to reach an external host, mirror it locally from a Node
process and remap with `--host-resolver-rules="MAP <host> 127.0.0.1"
--no-proxy-server` (working reference: `scripts/esm-mirror.mjs` in git
history, removed when React was vendored). Two related traps: Chromium on
Linux silently adopts `HTTPS_PROXY` from the environment, and Playwright's
`proxy:` option force-appends `<-loopback>`, routing even `127.0.0.1` through
the relay.

Dev-bundler trap that once broke this flow: Bun snapshots `process.env` at
server start, so `PUBLIC_*` inlining (bunfig `[serve.static] env`) never sees
vars set later from server code — a bare `process.env.…` then reaches the
browser and throws. The CLI launcher (`server/cli.ts`) defaults
`PUBLIC_TLDRAW_LICENSE_KEY` for this reason.
