import { describe, expect, test } from 'bun:test'

import { scopeAppletCss } from './applet-css'

describe('scopeAppletCss', () => {
  test('prefixes ordinary selectors with the applet container', () => {
    expect(scopeAppletCss('.card { color: red }', 'view:x')).toBe(
      '[data-applet="view:x"] .card { color: red }'
    )
  })

  test('maps page-root selectors onto the container', () => {
    expect(scopeAppletCss(':root { --x: 1 }\nbody { margin: 0 }', 'view:x')).toBe(
      '[data-applet="view:x"] { --x: 1 }\n[data-applet="view:x"] { margin: 0 }'
    )
  })

  test('scopes the descendant form the Tailwind plugin hands over', () => {
    // group-has-* output arrives already rewritten (tailwind-plugin.ts); the
    // scope goes in front of the group anchor.
    const css = String.raw`:where(.group\/input-group):has(> input) .group-has-\[\>input\]\/input-group\:pt-2 { padding-top: 8px }`
    expect(scopeAppletCss(css, 'view:mock-fleet')).toBe(
      String.raw`[data-applet="view:mock-fleet"] :where(.group\/input-group):has(> input) .group-has-\[\>input\]\/input-group\:pt-2 { padding-top: 8px }`
    )
  })

  test('leaves keyframe steps alone', () => {
    const css = '@keyframes spin { to { opacity: 1 } }'
    expect(scopeAppletCss(css, 'view:x')).toBe(css)
  })
})
