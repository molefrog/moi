import { describe, expect, test } from 'bun:test'

import { scopeAppletCss, unqualifyNonSubjectHas } from './applet-css'

// Selectors in these tests are real compiled output from workspace view
// bundles (shadcn input-group, avatar-group, alert-dialog via Tailwind
// `group-has-*`). The `:is(…:has(…) *)` shape makes Chrome restyle the whole
// document on every DOM mutation — see the comment on unqualifyNonSubjectHas.
describe('unqualifyNonSubjectHas', () => {
  test('rewrites group-has utilities to the descendant form', () => {
    expect(
      unqualifyNonSubjectHas(
        String.raw`.group-has-\[\>input\]\/input-group\:pt-2:is(:where(.group\/input-group):has(> input) *)`
      )
    ).toBe(
      String.raw`:where(.group\/input-group):has(> input) .group-has-\[\>input\]\/input-group\:pt-2`
    )
  })

  test('handles attribute arguments with quoted values (avatar-group)', () => {
    expect(
      unqualifyNonSubjectHas(
        String.raw`.group-has-data-\[size\=lg\]\/avatar-group\:\[\&\>svg\]\:size-5:is(:where(.group\/avatar-group):has([data-size="lg"]) *)`
      )
    ).toBe(
      String.raw`:where(.group\/avatar-group):has([data-size="lg"]) .group-has-data-\[size\=lg\]\/avatar-group\:\[\&\>svg\]\:size-5`
    )
  })

  test('moves only the :has qualifier when stacked with other :is qualifiers (alert-dialog)', () => {
    // group-data-* and group-has-data-* stacked on one utility: the non-:has
    // qualifier must stay attached to the subject, where it constrains the
    // same element — moving both would impose an ancestor order the original
    // selector never had.
    expect(
      unqualifyNonSubjectHas(
        String.raw`.sm\:group-data-\[size\=default\]\/adc\:col-start-2:is(:where(.group\/adc)[data-size="default"] *):is(:where(.group\/adc):has([data-slot="media"]) *)`
      )
    ).toBe(
      String.raw`:where(.group\/adc):has([data-slot="media"]) .sm\:group-data-\[size\=default\]\/adc\:col-start-2:is(:where(.group\/adc)[data-size="default"] *)`
    )
  })

  test('rewrites when a variant chain follows the first compound (avatar-group [&>svg]:)', () => {
    // The qualifier sits on the leftmost compound, so prepending its anchor
    // adds no ordering constraint on the ` > svg` chain that follows.
    expect(
      unqualifyNonSubjectHas(
        String.raw`.group-has-data-\[size\=lg\]\/avatar-group\:\[\&\>svg\]\:size-5:is(:where(.group\/avatar-group):has([data-size="lg"]) *) > svg`
      )
    ).toBe(
      String.raw`:where(.group\/avatar-group):has([data-size="lg"]) .group-has-data-\[size\=lg\]\/avatar-group\:\[\&\>svg\]\:size-5 > svg`
    )
  })

  test('keeps the sibling combinator of peer-has utilities', () => {
    expect(
      unqualifyNonSubjectHas(
        String.raw`.peer-has-checked\:hidden:is(:where(.peer):has(:checked) ~ *)`
      )
    ).toBe(String.raw`:where(.peer):has(:checked) ~ .peer-has-checked\:hidden`)
  })

  test('keeps trailing pseudo-classes on the subject', () => {
    expect(unqualifyNonSubjectHas('.util:is(.group:has(.x) *):hover')).toBe(
      '.group:has(.x) .util:hover'
    )
  })

  test('handles nested parens inside the :has() argument', () => {
    expect(unqualifyNonSubjectHas('.util:is(.group:has(:not(.x)) *)')).toBe(
      '.group:has(:not(.x)) .util'
    )
  })

  test('leaves subject-position :has() alone', () => {
    const selector = String.raw`.has-disabled\:bg-input\/50:has(:disabled)`
    expect(unqualifyNonSubjectHas(selector)).toBe(selector)
  })

  test('leaves :is() qualifiers without :has alone', () => {
    const selector = String.raw`.group-hover\:block:is(:where(.group):hover *)`
    expect(unqualifyNonSubjectHas(selector)).toBe(selector)
  })

  test('leaves qualifiers on a non-leftmost compound alone', () => {
    // Prepending the anchor here would force it above `:where(.parent)`,
    // an ordering the original selector does not require.
    const selector = ':where(.parent) .util:is(.group:has(.x) *)'
    expect(unqualifyNonSubjectHas(selector)).toBe(selector)
  })

  test('leaves multi-argument :is() qualifiers alone', () => {
    const selector = '.util:is(.group:has(.x) *, .standalone)'
    expect(unqualifyNonSubjectHas(selector)).toBe(selector)
  })

  test('leaves plain selectors alone', () => {
    expect(unqualifyNonSubjectHas('.btn')).toBe('.btn')
  })
})

describe('scopeAppletCss with :has rewriting', () => {
  test('scopes the rewritten descendant form', () => {
    const css = String.raw`.group-has-\[\>input\]\/input-group\:pt-2:is(:where(.group\/input-group):has(> input) *) { padding-top: 8px }`
    const out = scopeAppletCss(css, 'view:mock-fleet')
    expect(out).toBe(
      String.raw`[data-applet="view:mock-fleet"] :where(.group\/input-group):has(> input) .group-has-\[\>input\]\/input-group\:pt-2 { padding-top: 8px }`
    )
  })

  test('ordinary selectors keep the plain prefix', () => {
    expect(scopeAppletCss('.card { color: red }', 'view:x')).toBe(
      '[data-applet="view:x"] .card { color: red }'
    )
  })
})
