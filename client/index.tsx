// Must run before any tldraw module loads — see the file for why.
import './structured-clone-shim'

import './index.css'

// React is externalized to the locally-vendored ESM (see client/externalize-react.ts
// + the importmap in index.html → /vendor/react), so Bun's bundled Fast Refresh
// runtime isn't bound to the React
// instance that actually renders the app: it registers component families but
// performReactRefresh() no-ops, leaving stale modules mounted after an edit.
// Downgrade HMR to plain live-reload — every hot update triggers a full page
// reload, which re-fetches a clean bundle. Dead-code-eliminated in production.
if (import.meta.hot) {
  import.meta.hot.on('bun:beforeUpdate', () => location.reload())

  // Bun's HMR client (≤1.3.14) never re-arms `onclose` on the socket it
  // creates while reconnecting, so the second disconnect in a tab's life
  // (e.g. laptop sleep, then a dev-supervisor restart) silently kills
  // live-reload and the tab serves a stale bundle forever. Watchdog: poll
  // the shell and hard-reload when the served script generation no longer
  // matches the one this page is running.
  const devScript = document.querySelector<HTMLScriptElement>('[data-bun-dev-server-script]')
  if (devScript) {
    const scriptPath = new URL(devScript.src).pathname
    const checkStale = async () => {
      try {
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        if (!html.includes(scriptPath)) location.reload()
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
