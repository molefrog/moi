mei app (server)

bun server/index.ts -> launches main process with web server and control server
bun server/cli.ts bundle -> sends a signal to main process to scan widgets and rebuild changed ones

workspace/
  mei/
    package.json   <-- deps for widgets
    .build/
      widgets/
        :name.js   <-- pre-built ESM modules with injected tailwind CSS
    widgets/
      :name.tsx <-- user writes these and they export a default react component

web server API:
  /_mei/widgets/:name.js ESM module served from .build/
  /_mei/widgets          list all widgets as JSON { widgets: ["hello", ...] }
  /_mei/ws               websocket for pushing events to the frontend when widgets are updated

control server (port 9901):
  WS-only, accepts { type: "bundle" }, responds with { type: "bundle:done", built, skipped, failed }

widget build:
- uses Bun.build() with format: 'esm', target: 'browser'
- react, react-dom, react/jsx-runtime etc are external (browser importmap resolves them to esm.sh)
- tailwind css utilities-only (@import 'tailwindcss/utilities') injected into JS as a <style data-widget=":name"> tag
- no preflight, no theme reset -- widgets inherit host's theme vars (--color-primary etc)
- inline sourcemaps for debugging
- output written to workspace/mei/.build/widgets/:name.js
- incremental: skips widgets where source mtime <= built mtime

frontend:
- WidgetDashboard component fetches /_mei/widgets to discover all widgets
- useWidget(name) hook dynamically imports /_mei/widgets/:name.js with cache-busting ?v=N
- each widget renders inside a WidgetCard with name label and loading/error states
- useMeiEvent hook connects to /_mei/ws and dispatches events to subscribers
- on widget:updated -> useWidget busts cache and re-imports the module (hot swap, no page reload)
- on widget-layout:updated -> useWidgetList re-fetches the list, dashboard adds/removes cards


stories:
- when frontend requests list of widgets -> scans all .tsx/.ts in widgets/ and returns names
- when CLI sends `bun server/cli.ts bundle`:
  - connects to control server via WS
  - sends { type: "bundle" }
  - server snapshots built widgets, rebuilds only changed ones (mtime check), compares before/after
  - for each rebuilt widget -> broadcasts { type: "widget:updated", name } over /_mei/ws
  - if the set of built widgets changed -> broadcasts { type: "widget-layout:updated" }
  - responds to CLI with results (built, skipped, failed), CLI prints and exits
