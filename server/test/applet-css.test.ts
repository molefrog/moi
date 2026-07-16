import { describe, expect, test } from 'bun:test'

import { scopeAppletCss } from '../bundler/applet-css'

const SCOPE = 'widget:hello'
const ATTR = '[data-applet="widget:hello"]'

describe('scopeAppletCss', () => {
  test('prefixes plain selectors with the container attribute', () => {
    const out = scopeAppletCss('.flex { display: flex }', SCOPE)
    expect(out).toContain(`${ATTR} .flex`)
  })

  test('maps page-root selectors onto the container itself', () => {
    const out = scopeAppletCss(
      ':root, :host { --x: 1 }\nhtml, :host { line-height: 1.5 }\nbody { margin: 0 }',
      SCOPE
    )
    expect(out).toContain(`${ATTR}, ${ATTR} {`)
    expect(out).toContain(`${ATTR} { margin: 0 }`)
    expect(out).not.toMatch(/(^|\s):root/)
    expect(out).not.toContain('html')
    expect(out).not.toMatch(/(^|[^-\w])body/)
  })

  test('keeps compounds attached when rewriting a root token', () => {
    const out = scopeAppletCss(':root:has(.x) { --y: 2 }', SCOPE)
    expect(out).toContain(`${ATTR}:has(.x)`)
  })

  test('does not rewrite tags that merely start with a root token name', () => {
    const out = scopeAppletCss('bodycopy { color: red }', SCOPE)
    expect(out).toContain(`${ATTR} bodycopy`)
  })

  test('scopes rules nested in @media and @layer', () => {
    const css = '@layer utilities { @media (min-width: 768px) { .md\\:flex { display: flex } } }'
    const out = scopeAppletCss(css, SCOPE)
    expect(out).toContain(`${ATTR} .md\\:flex`)
    expect(out).toContain('@media (min-width: 768px)')
  })

  test('scopes the universal preflight selector list', () => {
    const out = scopeAppletCss('*, ::before, ::after { box-sizing: border-box }', SCOPE)
    expect(out).toContain(`${ATTR} *, ${ATTR} ::before, ${ATTR} ::after`)
  })

  test('leaves @keyframes step selectors alone', () => {
    const css = '@keyframes spin { 0% { rotate: 0deg } to { rotate: 360deg } }'
    const out = scopeAppletCss(css, SCOPE)
    expect(out).toContain('0% {')
    expect(out).toContain('to {')
    expect(out).not.toContain(`${ATTR} 0%`)
  })

  test('leaves @property and @font-face untouched', () => {
    const css =
      '@property --tw-x { syntax: "*"; inherits: false }\n@font-face { font-family: X; src: url(x.woff2) }'
    expect(scopeAppletCss(css, SCOPE)).toBe(css)
  })

  test('keeps variant pseudos attached to the element (dark mode)', () => {
    const out = scopeAppletCss('.dark\\:bg-black:is(.dark *) { background: black }', SCOPE)
    // `:is(.dark *)` stays on the element so the host's <html class="dark">
    // still activates it; only the scope prefix is prepended.
    expect(out).toContain(`${ATTR} .dark\\:bg-black:is(.dark *)`)
  })
})
