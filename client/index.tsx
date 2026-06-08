import './index.css'

// React is externalized to esm.sh (see client/externalize-react.ts + the importmap
// in index.html), so Bun's bundled Fast Refresh runtime isn't bound to the React
// instance that actually renders the app: it registers component families but
// performReactRefresh() no-ops, leaving stale modules mounted after an edit.
// Downgrade HMR to plain live-reload — every hot update triggers a full page
// reload, which re-fetches a clean bundle. Dead-code-eliminated in production.
if (import.meta.hot) {
  import.meta.hot.on('bun:beforeUpdate', () => location.reload())
}

export async function init(el: HTMLElement) {
  const { mount } = await import('./main')
  mount(el)
}

// Expose init globally so the preload script can call it
globalThis.__init = init
