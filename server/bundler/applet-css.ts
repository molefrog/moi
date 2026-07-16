// Scopes a compiled applet stylesheet to its mount container.
//
// Applet bundles compile with the full `@import 'tailwindcss'` — preflight,
// theme variables, utilities — and the result is injected into the host
// document at runtime. Unscoped, those rules are page-global: the widget's
// preflight resets host elements, its theme layer redefines variables on
// `:root`, and its utilities (arriving later in the document than the host
// stylesheet) win cascade ties against the host's — most visibly for
// media-query variants. Scoping pins every rule to the applet's own subtree.
//
// The transform prefixes each selector with `[data-applet="<scope>"]` — the
// attribute the client puts on the applet's mount container (see
// client/features/applets/AppletMount.tsx). Selectors that address the page
// root (`:root`, `:host`, `html`, `body`) are mapped onto the container
// itself, so theme variables and preflight inheritance (line-height, font)
// land there and inherit down. Rules inside `@keyframes` are left alone —
// keyframe step selectors (`0%`, `to`) aren't element selectors.
//
// The uniform `+1 attribute` specificity bump preserves the stylesheet's
// internal cascade and makes applet rules beat same-layer host rules inside
// the container — which is exactly the priority we want.
//
// Known limitation: content the applet portals outside its container
// (e.g. to document.body) escapes the scope and won't receive applet styles.
import postcss, { type Container, type Document } from 'postcss'

// A selector's leading page-root token, if any. `(?![\w-])` keeps `body` from
// matching an unrelated tag/class prefix like `bodycopy`.
const PAGE_ROOT_RE = /^(:root|:host|html|body)(?![\w-])/

function insideKeyframes(parent: Container | Document | undefined): boolean {
  return parent?.type === 'atrule' && /keyframes$/i.test((parent as { name: string }).name)
}

export function scopeAppletCss(css: string, scope: string): string {
  const container = `[data-applet=${JSON.stringify(scope)}]`
  const root = postcss.parse(css)

  root.walkRules(rule => {
    if (insideKeyframes(rule.parent)) return
    rule.selectors = rule.selectors.map(selector => {
      const s = selector.trim()
      const rootToken = PAGE_ROOT_RE.exec(s)
      if (rootToken) return container + s.slice(rootToken[0].length)
      return `${container} ${s}`
    })
  })

  return root.toString()
}
