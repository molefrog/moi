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

// Tailwind's `group-has-*` / `peer-has-*` utilities compile to
// `.util:is(:where(.group):has(…) *)` — a non-subject `:has()` qualifying a
// universal `*` subject. Chrome cannot build a precise invalidation set for
// that shape and falls back to restyling the WHOLE document on unrelated DOM
// mutations: with one such rule mounted, every keystroke anywhere on the page
// recalculated styles for all ~10k elements (~140ms per key next to a large
// view — measured, see the chat-input-lag investigation). The equivalent
// descendant form `:where(.group):has(…) .util` matches the same elements
// with the same specificity (`:is()` takes its most specific argument), and
// Chrome invalidates it precisely.
//
// The rewrite is deliberately conservative, because it is only safe when it
// cannot reorder ancestor constraints:
//   • The qualifier must sit on the LEFTMOST compound. That compound has no
//     ancestor constraints to its left, so prepending its anchor imposes
//     nothing new — this covers `.util:is(Q *)` and variant chains like
//     `.util:is(Q *) > svg` (the `[&>svg]:` arbitrary variant). On any later
//     compound (`A .util:is(Q *)`) the prepended anchor would force Q above
//     A, which the original never required, so those are skipped.
//   • Only the ONE `:is(…:has(…) *)` qualifier moves out. Every other
//     qualifier (`:is(:where(.group)[data-x] *)`, stacked pseudos) stays on
//     the subject, where it keeps constraining the same element — shadcn's
//     alert-dialog stacks `group-data-*` and `group-has-data-*` exactly like
//     this. Moving two anchors out would chain them into a strict ancestor
//     order the original didn't have, so a second `:has` qualifier is left
//     in place.
//   • A qualifier with a top-level comma (`:is(A *, B)`) is skipped — the
//     extraction is only equivalence-preserving for a single argument.
// The trailing `~` of `peer-has-*` (`:is(:where(.peer):has(…) ~ *)`) rides
// along, keeping the sibling combinator.

// Index of the first top-level combinator (space, >, +, ~ outside parens,
// brackets, and strings), or -1 when the selector is a single compound.
function firstCombinatorIndex(selector: string): number {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]!
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '\\') i++
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) return i
  }
  return -1
}

// The span of the first `:is(…)` qualifier whose single argument contains
// `:has(` and ends with a universal `*` subject, or null.
function findHasQualifier(selector: string): { start: number; end: number; anchor: string } | null {
  for (let from = 0; ; ) {
    const start = selector.indexOf(':is(', from)
    if (start === -1) return null
    // Find the matching close paren, tracking nested parens and strings.
    let depth = 0
    let quote: string | null = null
    let end = -1
    let topComma = false
    for (let i = start + 3; i < selector.length; i++) {
      const ch = selector[i]!
      if (quote) {
        if (ch === '\\') i++
        else if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") quote = ch
      else if (ch === '\\') i++
      else if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      } else if (ch === ',' && depth === 1) topComma = true
    }
    if (end === -1) return null
    const inner = selector.slice(start + 4, end).trim()
    if (!topComma && inner.includes(':has(') && inner.endsWith('*')) {
      const anchor = inner.slice(0, -1).trim()
      if (anchor.length > 0) return { start, end: end + 1, anchor }
    }
    from = end + 1
  }
}

export function unqualifyNonSubjectHas(selector: string): string {
  if (!selector.includes(':has(')) return selector
  const combinatorAt = firstCombinatorIndex(selector)
  const compound = combinatorAt === -1 ? selector : selector.slice(0, combinatorAt)
  const rest = combinatorAt === -1 ? '' : selector.slice(combinatorAt)
  const qualifier = findHasQualifier(compound)
  if (!qualifier) return selector
  const subject = (compound.slice(0, qualifier.start) + compound.slice(qualifier.end)).trim()
  if (subject.length === 0) return selector
  // `anchor` may end with the peer variant's `~`; the join keeps it a sibling
  // combinator, otherwise it's a descendant combinator.
  return `${qualifier.anchor} ${subject}${rest}`
}

function insideKeyframes(parent: Container | Document | undefined): boolean {
  return (
    parent?.type === 'atrule' &&
    'name' in parent &&
    typeof parent.name === 'string' &&
    /keyframes$/i.test(parent.name)
  )
}

export function scopeAppletCss(css: string, scope: string): string {
  const container = `[data-applet=${JSON.stringify(scope)}]`
  const root = postcss.parse(css)

  root.walkRules(rule => {
    if (insideKeyframes(rule.parent)) return
    rule.selectors = rule.selectors.map(selector => {
      const s = unqualifyNonSubjectHas(selector.trim())
      const rootToken = PAGE_ROOT_RE.exec(s)
      if (rootToken) return container + s.slice(rootToken[0].length)
      return `${container} ${s}`
    })
  })

  return root.toString()
}
