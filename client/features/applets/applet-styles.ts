import { useInsertionEffect } from 'react'

// Host-managed applet styles. An applet bundle no longer appends its own
// <style> to <head> (which stuck around forever — a cached ES module is never
// re-evaluated, let alone disposed). Instead its module side effect registers
// the compiled, container-scoped CSS on `window.__moiAppletCss`, keyed by the
// bundle-dir path (`/api/workspaces/<id>/<segment>/<name>` — see injectCss in
// server/bundler/build-applet.ts and `appletStyleKey`). The host injects a <style> for
// that key while at least one instance of the applet is mounted, and removes it
// when the last one unmounts.
declare global {
  interface Window {
    __moiAppletCss?: Map<string, string>
  }
}

type ActiveStyle = {
  el: HTMLStyleElement
  refs: number
}

const active = new Map<string, ActiveStyle>()

// Mount the applet's registered CSS (refcounted); returns the release fn.
// Exported for tests — components should use `useAppletStyle`.
export function acquireAppletStyle(key: string): () => void {
  const css = window.__moiAppletCss?.get(key) ?? ''

  let entry = active.get(key)
  if (!entry) {
    const el = document.createElement('style')
    el.dataset.appletStyle = key
    document.head.appendChild(el)
    entry = { el, refs: 0 }
    active.set(key, entry)
  }
  // Always sync the text: after a rebuild the registry holds fresh CSS under
  // the same key while an older instance may still be mounted (exit animation).
  if (entry.el.textContent !== css) entry.el.textContent = css

  entry.refs++
  const acquired = entry
  let released = false
  return () => {
    if (released) return
    released = true
    acquired.refs--
    if (acquired.refs <= 0) {
      acquired.el.remove()
      active.delete(key)
    }
  }
}

// Keep the applet's <style> mounted for the lifetime of the calling component.
// `version` re-runs the effect after a rebuild so the tag picks up the fresh
// registry text. useInsertionEffect runs before layout effects and paint, so
// the styles are in place before the applet's first frame.
export function useAppletStyle(key: string, version: number): void {
  useInsertionEffect(() => acquireAppletStyle(key), [key, version])
}
