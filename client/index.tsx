// Must run before any tldraw module loads — see the file for why.
import './structured-clone-shim'

import './index.css'

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
  // Watchdog for Bun's HMR client (≤1.3.14) never re-arming `onclose` on the
  // socket it creates while reconnecting: the second disconnect in a tab's
  // life (e.g. laptop sleep, then a dev-supervisor restart) silently kills
  // live updates — no disconnect event fires, so only polling can catch it.
  // A hash mismatch alone is NOT staleness anymore: in-place hot updates
  // legitimately leave the page behind the served script hash. Reload only
  // when the server moved on AND no HMR traffic reached this page around
  // that change — that combination means the socket is dead.
  let lastEventAt = Date.now()
  for (const ev of ['bun:beforeUpdate', 'bun:afterUpdate', 'bun:ws:connect'] as const) {
    import.meta.hot.on(ev, () => (lastEventAt = Date.now()))
  }

  const devScript = document.querySelector<HTMLScriptElement>('[data-bun-dev-server-script]')
  if (devScript) {
    let baseline = new URL(devScript.src).pathname
    let staleSince: number | null = null
    const checkStale = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        const current = html.match(/\/_bun\/client\/index-[0-9a-f]+\.js/)?.[0]
        if (!current || current === baseline) {
          staleSince = null
          return
        }
        staleSince ??= Date.now()
        if (lastEventAt >= staleSince - 5_000) {
          // An update event reached us around the change — the socket is
          // alive and the update was applied in place. Adopt the new hash.
          baseline = current
          staleSince = null
        } else if (Date.now() - staleSince > 10_000) {
          location.reload()
        }
      } catch {
        // server mid-restart — the next tick will catch it
      }
    }
    setInterval(checkStale, 5_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkStale()
    })
  }
}

export async function init(el: HTMLElement) {
  const { mount } = await import('./main')
  mount(el)
}

// Expose init globally so the preload script can call it
globalThis.__init = init
