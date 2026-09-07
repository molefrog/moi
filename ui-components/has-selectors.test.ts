import { expect, test } from 'bun:test'
import { parse } from '@babel/parser'
import { join } from 'node:path'
import postcss from 'postcss'
import { compile } from 'tailwindcss'

function stringTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(stringTokens)
  if (!value || typeof value !== 'object') return []
  if ('type' in value && value.type === 'StringLiteral' && 'value' in value) {
    return typeof value.value === 'string' ? value.value.split(/\s+/) : []
  }
  return Object.values(value).flatMap(stringTokens)
}

// Compile actual component classes without the applet CSS repair. The host
// and registry consumers must not depend on that compatibility transform.
test('shared components avoid universal subjects inside relational :is selectors', async () => {
  const candidates = new Set<string>()
  for await (const file of new Bun.Glob('*.tsx').scan(import.meta.dir)) {
    if (file.endsWith('.test.tsx')) continue
    const source = await Bun.file(join(import.meta.dir, file)).text()
    for (const token of stringTokens(
      parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
    )) {
      candidates.add(token)
    }
  }
  const theme = [
    await Bun.file(Bun.resolveSync('tailwindcss/theme.css', import.meta.dir)).text(),
    await Bun.file(join(import.meta.dir, '../client/theme.css')).text(),
    '@custom-variant dark-or-vivid (&:is(.dark *, [data-vivid], [data-vivid] *));',
    '@tailwind utilities;'
  ].join('\n')
  const compiler = await compile(theme)
  const css = compiler.build([...candidates])
  const unsafe: string[] = []
  postcss.parse(css).walkRules(rule => {
    for (const selector of rule.selectors) {
      if (/:is\([^{}]*:has\([^{}]*\*/.test(selector)) unsafe.push(selector)
    }
  })
  expect(unsafe).toEqual([])

  // A missing or malformed arbitrary variant would also make the unsafe
  // selector disappear. Ensure every replacement still emits a CSS rule.
  const relational = [...candidates].filter(token => token.includes('[:where([class~='))
  expect(relational.length).toBeGreaterThan(0)
  for (const candidate of relational) {
    const single = await compile(theme)
    const selectors: string[] = []
    postcss.parse(single.build([candidate])).walkRules(rule => {
      selectors.push(rule.selector)
    })
    expect(selectors.some(selector => selector.includes(':has('))).toBe(true)
  }
})
