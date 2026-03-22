mei app (server)

bun server/cli.ts serve -> launches web server and control server
bun server/cli.ts bundle -> sends a signal to main process to scan and rebuild changed files
./mei/cmd bundle -> same, from workspace

workspace/
  mei/
    package.json      <-- deps for widgets and server functions
    cmd               <-- executable, shortcut for `bun server/cli.ts`
    :name.tsx         <-- widget, exports a default react component
    :name.server.ts   <-- server functions for the widget (or shared)
    .build/
      widgets/
        :name.js      <-- pre-built ESM modules with injected tailwind CSS

everything is flat, no subdirectories. one file per widget, one file per server module.

web server API:
  /_mei/widgets/:name.js    ESM module served from .build/widgets/
  /_mei/widgets             list all widgets as JSON { widgets: ["hello", ...] }
  /_mei/fn/:module/:name    POST, calls a server function, returns JSON
  /_mei/ws                  websocket for pushing events to the frontend

control server (port 13059):
  WS-only, accepts { type: "bundle" }, responds with build results array

widget build:
- uses Bun.build() with format: 'esm', target: 'browser'
- react, react-dom, react/jsx-runtime etc are external (browser importmap resolves them to esm.sh)
- tailwind css utilities-only (@import 'tailwindcss/utilities') injected into JS as a <style data-widget=":name"> tag
- no preflight, no theme reset -- widgets inherit host's theme vars (--color-primary etc)
- inline sourcemaps for debugging
- output written to .build/widgets/:name.js
- incremental: skips files where source mtime <= built mtime

server functions:
- widgets import from `./:name.server` — e.g. `import { getWeather } from './weather.server'`
- only `async function` can be exported from .server.ts (not const, not sync function, not class)
- this ensures TypeScript types match reality: both the real function and the proxy return Promise<T>
- during widget build, a Bun plugin rewrites .server.ts imports into fetch() proxies:
    import { getWeather } from './weather.server'  →  POST /_mei/fn/weather/getWeather
- at build time, non-function exports from .server.ts raise an error
- the real .server.ts runs in a separate Bun child process (isolation from web server)
- communication between web and functions process via Bun IPC
- server functions are loaded directly from source (not compiled) — Bun runs TypeScript natively
- functions are long-lived modules (singleton per version), persistent state (open DBs, caches) survives between requests
- on bundle, changed function modules are evicted and re-imported (optional dispose() export for cleanup)
- module cache busting via ?t=mtime query string on dynamic import
- arg serialization uses devalue (handles Date, Map, Set, Error etc.)
- call timeout: 30s per function call, rejects with error if exceeded
- worker auto-respawns on crash, rejects all pending calls

frontend:
- WidgetDashboard component fetches /_mei/widgets to discover all widgets
- useWidget(name) hook dynamically imports /_mei/widgets/:name.js with cache-busting ?v=N
- each widget renders inside a WidgetCard with name label and loading/error states
- useMeiEvent hook connects to /_mei/ws and dispatches events to subscribers
- on widget:updated -> useWidget busts cache and re-imports the module (hot swap, no page reload)
- on widget-layout:updated -> useWidgetList re-fetches the list, dashboard adds/removes cards


stories:
- when frontend requests list of widgets -> scans all .tsx/.ts in mei/ and returns names
- when CLI sends `bun server/cli.ts bundle`:
  - connects to control server via WS
  - sends { type: "bundle" }
  - server snapshots built widgets, rebuilds only changed ones (mtime check), compares before/after
  - for each rebuilt widget -> broadcasts { type: "widget:updated", name } over /_mei/ws
  - if the set of built widgets changed -> broadcasts { type: "widget-layout:updated" }
  - responds to CLI with results (built, skipped, failed), CLI prints and exits
