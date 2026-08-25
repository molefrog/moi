import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import postcss from 'postcss'
import type { Root } from 'postcss'

type ColorMapping = {
  property: string
  variable: string
}

function topLevelDeclarationCounts(root: Root, selector: ':root' | '.dark'): Map<string, number> {
  const counts = new Map<string, number>()

  root.each(node => {
    if (node.type !== 'rule' || node.selector !== selector) return
    node.each(child => {
      if (child.type !== 'decl') return
      counts.set(child.prop, (counts.get(child.prop) ?? 0) + 1)
    })
  })

  return counts
}

describe('semantic color token CSS', () => {
  test('keeps direct mappings unique and declared once in both modes', async () => {
    const [indexCss, themeCss] = await Promise.all([
      Bun.file(join(import.meta.dir, '../../client/index.css')).text(),
      Bun.file(join(import.meta.dir, '../../client/theme.css')).text()
    ])
    const indexRoot = postcss.parse(indexCss)
    const mappings: ColorMapping[] = []

    postcss.parse(themeCss).walkDecls(/^--color-/, declaration => {
      const token = declaration.prop.slice('--color-'.length)
      const directReference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(declaration.value.trim())
      expect(directReference?.[1]).toBe(`--${token}`)
      mappings.push({ property: declaration.prop, variable: `--${token}` })
    })

    expect(mappings.length).toBeGreaterThan(0)
    expect(new Set(mappings.map(mapping => mapping.property)).size).toBe(mappings.length)
    expect(new Set(mappings.map(mapping => mapping.variable)).size).toBe(mappings.length)

    const lightDeclarations = topLevelDeclarationCounts(indexRoot, ':root')
    const darkDeclarations = topLevelDeclarationCounts(indexRoot, '.dark')
    for (const { variable } of mappings) {
      expect(lightDeclarations.get(variable)).toBe(1)
      expect(darkDeclarations.get(variable)).toBe(1)
    }
  })
})
