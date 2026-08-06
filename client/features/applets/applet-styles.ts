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

// Move an applet's <style> to the end of <head>. Everything in an applet sheet
// is scoped to its `[data-applet]` container and so can't collide — except the
// names of global at-rules (`@keyframes`, `@property`, `@font-face`), which the
// scoper leaves alone because they aren't selectors (server/bundler/applet-css.ts).
// Two applets defining `@keyframes pulse` differently therefore share one
// document-global name, and the last definition wins for both. Raising the
// applet the user is looking at makes the winner the one on screen.
export function raiseAppletStyle(key: string): void {
  const entry = active.get(key)
  if (!entry || entry.el === document.head.lastElementChild) return
  document.head.appendChild(entry.el)
}

// Keep the applet's <style> mounted for the lifetime of the calling component.
// `version` re-runs the effect after a rebuild so the tag picks up the fresh
// registry text. useInsertionEffect runs before layout effects and paint, so
// the styles are in place before the applet's first frame.
//
// `onTop` marks the applet as the visible one — see `raiseAppletStyle`. Only
// ever set it on one mounted applet at a time; with several claiming it the
// winner is whichever effect React happens to run last.
export function useAppletStyle(key: string, version: number, onTop = false): void {
  useInsertionEffect(() => acquireAppletStyle(key), [key, version])
  useInsertionEffect(() => {
    if (onTop) raiseAppletStyle(key)
  }, [key, onTop, version])
}
