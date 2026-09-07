import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import tailwind, { unqualifyNonSubjectHas, unqualifyNonSubjectHasRules } from './tailwind-plugin'

const FIXTURES = join(import.meta.dir, '..', 'test', '__fixtures__')
const ROOT = join(import.meta.dir, '..', '..')

// Tailwind's `group-has-*` / `peer-has-*` output: an `:is()` qualifier whose
// argument opens with the group/peer anchor and a non-subject `:has()`.
const HAS_QUALIFIER = /:is\(:where\(\.(?:group|peer)[^)]*\):has\(/

// Bun re-prints the stylesheet it bundles; collapse its whitespace choices so
// assertions can spell selectors the way Tailwind emits them.
function compact(css: string): string {
  return css.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
}

async function compile(entrypoint: string, root: string): Promise<string> {
  const result = await Bun.build({ entrypoints: [entrypoint], plugins: [tailwind], root })
  const output = result.outputs.find(o => o.path.endsWith('.css'))
  if (!output) throw new Error('the build emitted no stylesheet')
  return output.text()
}

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

  // Bun's dev bundler serves Tailwind's nested output as-is: the qualifier
  // sits on a `&` rule under the utility. The anchor goes in front of `&`,
  // which nesting resolves to the same descendant form.
  test('rewrites the nested form the dev bundler serves', () => {
    expect(unqualifyNonSubjectHas(String.raw`&:is(:where(.group\/field):has(:disabled) *)`)).toBe(
      String.raw`:where(.group\/field):has(:disabled) &`
    )
    expect(unqualifyNonSubjectHas('&:is(:where(.peer):has(:checked) ~ *)')).toBe(
      ':where(.peer):has(:checked) ~ &'
    )
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

describe('unqualifyNonSubjectHasRules', () => {
  test('rewrites every rule of a stylesheet and leaves the rest untouched', () => {
    const css = [
      String.raw`.group-has-\[\>input\]\/input-group\:pt-2:is(:where(.group\/input-group):has(> input) *) { padding-top: 8px }`,
      '.a:is(.g:has(.x) *), .b:is(.g:has(.y) *) { color: red }',
      '.card { color: red }',
      '@keyframes spin { to { transform: rotate(360deg) } }'
    ].join('\n')

    expect(unqualifyNonSubjectHasRules(css)).toBe(
      [
        String.raw`:where(.group\/input-group):has(> input) .group-has-\[\>input\]\/input-group\:pt-2 { padding-top: 8px }`,
        '.g:has(.x) .a, .g:has(.y) .b { color: red }',
        '.card { color: red }',
        '@keyframes spin { to { transform: rotate(360deg) } }'
      ].join('\n')
    )
  })

  test('returns a stylesheet without :has() as is', () => {
    const css = '.card{color:red}'
    expect(unqualifyNonSubjectHasRules(css)).toBe(css)
  })

  test('rewrites nested rules', () => {
    const css = '.util {\n  &:is(:where(.group):has(.x) *) {\n    opacity: 0.5;\n  }\n}'
    expect(unqualifyNonSubjectHasRules(css)).toBe(
      '.util {\n  :where(.group):has(.x) & {\n    opacity: 0.5;\n  }\n}'
    )
  })
})

describe('tailwind plugin', () => {
  test('rewrites group-has and peer-has utilities in a bundled stylesheet', async () => {
    const css = compact(await compile(join(FIXTURES, 'group-has.css'), FIXTURES))

    expect(css).not.toMatch(HAS_QUALIFIER)
    expect(css).toContain(
      String.raw`:where(.group\/input-group):has(> input) .group-has-\[\>input\]\/input-group\:pt-2 {`
    )
    expect(css).toContain(String.raw`:where(.peer):has(:checked) ~ .peer-has-checked\:hidden {`)
  })

  // The regression this guards: the host app shares shadcn components with
  // ui-components/ (checkbox, switch, field, input-group, …), whose
  // `group-has-*` utilities land in the host stylesheet — the one bundle that
  // never went through the applet scoper's rewrite, so one mounted rule made
  // every keystroke restyle the whole document.
  test('keeps the host stylesheet free of non-subject :has qualifiers', async () => {
    const css = await compile(join(ROOT, 'client', 'index.css'), ROOT)

    expect(css).toContain('--color-background')
    expect(css).not.toMatch(HAS_QUALIFIER)
  })
})
