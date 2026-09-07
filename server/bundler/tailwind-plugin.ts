// moi's Tailwind bundler plugin: `bun-plugin-tailwind`, with its compiled CSS
// post-processed before Bun's CSS pipeline sees it. Every stylesheet moi
// bundles compiles through this module — the host app in dev (bunfig.toml
// `[serve.static]`) and prod (scripts/build-client.ts), and applet bundles
// (build-applet.ts) — so a fix to Tailwind's output lands everywhere at once.
// Never wire `bun-plugin-tailwind` directly: shadcn's field, input-group,
// avatar-group, alert, alert-dialog, checkbox, radio-group, switch and
// combobox all use the `group-has-*` variants below, and the host shares
// those components (client/components/ui/ re-exports ui-components/), so the
// pathological shape reaches the host stylesheet and applet bundles alike.
import type { BunPlugin, PluginBuilder } from 'bun'
import upstream from 'bun-plugin-tailwind'
import postcss from 'postcss'

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

// Applies the rewrite to every rule of a stylesheet. Rules without `:has(`
// (keyframe steps included) are never touched.
export function unqualifyNonSubjectHasRules(css: string): string {
  if (!css.includes(':has(')) return css
  const root = postcss.parse(css)
  root.walkRules(rule => {
    if (!rule.selector.includes(':has(')) return
    rule.selectors = rule.selectors.map(selector => unqualifyNonSubjectHas(selector.trim()))
  })
  return root.toString()
}

const tailwind: BunPlugin = {
  name: 'moi-tailwind',
  setup(build) {
    // Upstream registers a single `onLoad` for `.css` files that returns the
    // compiled stylesheet as `{ contents, loader: 'css' }`. It gets a builder
    // whose `onLoad` rewrites those contents on the way out; everything else
    // (`config.root` for source auto-detection, the native `onBeforeParse`
    // candidate scanner) is forwarded untouched, so upstream behaves exactly
    // as if it were wired directly.
    const onLoad: PluginBuilder['onLoad'] = (constraints, callback) =>
      build.onLoad(constraints, async args => {
        const result = await callback(args)
        if (result && 'contents' in result && typeof result.contents === 'string') {
          return { ...result, contents: unqualifyNonSubjectHasRules(result.contents) }
        }
        return result
      })
    const builder = new Proxy(build, {
      get(target, property) {
        if (property === 'onLoad') return onLoad
        const value: unknown = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
    return upstream.setup(builder)
  }
}

export default tailwind
