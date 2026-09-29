// Must run before any tldraw module loads — see the file for why.
import './structured-clone-shim'

import 'blobatar/motion.css'
import './index.css'

import { startHmrWatchdog } from './runtime/hmr-watchdog'

// React Fast Refresh works here despite React being externalized to the
// locally-vendored ESM (client/externalize-react.ts + the importmap in
// index.html → /vendor/react): Bun's bundled refresh runtime wraps
// `__REACT_DEVTOOLS_GLOBAL_HOOK__` before the vendored react-dom registers,
// and the hook is a plain global, so the renderer link works across the
// bundle/vendor boundary. The one missing piece was that the externalized
// virtual modules (`esm:react/jsx-dev-runtime` etc.) were never hot-accepted,
// which made EVERY edit propagate to the entry and force a full reload —
// fixed by the `import.meta.hot.accept()` in externalize-react.ts. Component
// edits now apply in place; non-component modules (main.tsx, lib/*) still
// fall back to a full reload via Bun's runtime, which is correct.
if (import.meta.hot) {
  startHmrWatchdog()
}

export async function init(el: HTMLElement) {
  // Startup config and any proxy-verified user load in parallel with the
  // main chunk, so both are available synchronously from the first render.
  const [{ mount }] = await Promise.all([
    import('./main'),
    import('./api/app-config').then(m => m.loadAppConfig()),
    import('./features/collab/proxy-user').then(m => m.loadProxyUser())
  ])
  mount(el)
}

// Expose init globally so the preload script can call it
globalThis.__init = init
