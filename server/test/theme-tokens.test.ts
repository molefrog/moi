import { describe, expect, test } from 'bun:test'

import { COLOR_THEMES, DEFAULT_PRIMARY_COLOR } from '@/lib/themes'
import type { ColorTheme } from '@/lib/themes'

import {
  formatThemeColor,
  loadThemeTokenSource,
  parseThemeTokenSource,
  resolveThemeColorValue,
  resolveWorkspaceThemeTokens
} from '../theme-tokens'

const SIMPLE_INDEX_CSS = `
:root {
  --background: white;
  --foreground: black;
}
.dark {
  --background: black;
  --foreground: white;
}
`

const SIMPLE_THEME_CSS = `
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}
`

describe('parseThemeTokenSource', () => {
  test('discovers the semantic token order and base values from CSS', () => {
    expect(parseThemeTokenSource(SIMPLE_INDEX_CSS, SIMPLE_THEME_CSS)).toEqual({
      tokens: ['background', 'foreground'],
      light: { background: 'white', foreground: 'black' },
      dark: { background: 'black', foreground: 'white' }
    })
  })

  test('loads every semantic color exposed by the current theme', async () => {
    const source = await loadThemeTokenSource()
    expect(source.tokens).toHaveLength(24)
    expect(source.tokens).toEqual([
      'background',
      'foreground',
      'card',
      'card-foreground',
      'popover',
      'popover-foreground',
      'primary',
      'primary-foreground',
      'muted',
      'muted-foreground',
      'accent',
      'accent-foreground',
      'success',
      'destructive',
      'border',
      'input',
      'ring',
      'secondary',
      'secondary-foreground',
      'chart-1',
      'chart-2',
      'chart-3',
      'chart-4',
      'chart-5'
    ])
    expect(Object.keys(source.light)).toEqual(source.tokens)
    expect(Object.keys(source.dark)).toEqual(source.tokens)
  })

  test('rejects missing light and dark declarations', () => {
    expect(() =>
      parseThemeTokenSource(
        ':root { --other: white; } .dark { --background: black; }',
        '@theme inline { --color-background: var(--background); }'
      )
    ).toThrow('Semantic color token --background is missing from :root')

    expect(() =>
      parseThemeTokenSource(
        ':root { --background: white; } .dark { --other: black; }',
        '@theme inline { --color-background: var(--background); }'
      )
    ).toThrow('Semantic color token --background is missing from .dark')
  })

  test('rejects duplicate declarations and mappings', () => {
    expect(() =>
      parseThemeTokenSource(
        ':root { --background: white; --background: black; } .dark { --background: black; }',
        '@theme inline { --color-background: var(--background); }'
      )
    ).toThrow('Duplicate --background declaration in :root')
    expect(() =>
      parseThemeTokenSource(
        ':root { --background: white; } .dark { --background: black; }',
        '@theme inline { --color-background: var(--background); --color-background: var(--background); }'
      )
    ).toThrow('Duplicate semantic color token --background')
  })

  test('rejects semantic mappings that do not directly expose the same CSS variable', () => {
    expect(() =>
      parseThemeTokenSource(
        ':root { --background: white; } .dark { --background: black; }',
        '@theme inline { --color-background: var(--other); }'
      )
    ).toThrow('--color-background must map directly to var(--background)')
  })
})

describe('resolveThemeColorValue', () => {
  const tokens = {
    primary: 'oklch(0.205 0 0)',
    foreground: 'oklch(0.145 0 0)',
    accent: 'oklch(0 0 0 / 0.07)',
    secondary: 'var(--accent)'
  }

  test('parses plain colors and follows aliases', () => {
    expect(formatThemeColor(resolveThemeColorValue('oklch(1 0 0)', tokens))).toBe('#ffffff')
    const alias = resolveThemeColorValue('var(--secondary)', tokens)
    expect(alias.alpha).toBeCloseTo(0.07)
    expect(formatThemeColor(alias)).toBe('#00000012')
  })

  test('evaluates supported color-mix forms', () => {
    const transparent = resolveThemeColorValue(
      'color-mix(in srgb, var(--foreground) 7%, transparent)',
      tokens
    )
    expect(transparent.alpha).toBeCloseTo(0.07)

    const even = resolveThemeColorValue('color-mix(in srgb, white 50%, black 50%)', tokens)
    expect(even.alpha).toBe(1)
    expect(even.r).toBeCloseTo(0.5)

    const short = resolveThemeColorValue(
      'color-mix(in srgb, var(--primary) 4%, var(--foreground) 4%)',
      tokens
    )
    expect(short.alpha).toBeCloseTo(0.08)
  })

  test('rejects missing aliases, cycles, and unsupported syntax', () => {
    expect(() => resolveThemeColorValue('var(--nope)', tokens)).toThrow(
      'Unknown theme token reference --nope'
    )
    expect(() => resolveThemeColorValue('var(--a)', { a: 'var(--b)', b: 'var(--a)' })).toThrow(
      'Circular theme token reference'
    )
    expect(() =>
      resolveThemeColorValue('color-mix(in oklch, white 50%, black 50%)', tokens)
    ).toThrow('Unsupported theme color value')
  })
})

describe('resolveWorkspaceThemeTokens', () => {
  test('the default view scope reveals the base light and dark theme', async () => {
    const rows = resolveWorkspaceThemeTokens(await loadThemeTokenSource(), undefined, 'view')
    const byToken = new Map(rows.map(row => [row.token, row]))

    expect(rows.every(row => !row.derived)).toBe(true)
    expect(byToken.get('background')).toMatchObject({ light: '#ffffff', dark: '#0a0a0a' })
    expect(byToken.get('chart-1')!.light).not.toBe(byToken.get('chart-1')!.dark)
  })

  test('a view color preset derives its semantic surface tokens', async () => {
    const rows = resolveWorkspaceThemeTokens(await loadThemeTokenSource(), { color: 'sky' }, 'view')
    const byToken = new Map(rows.map(row => [row.token, row]))

    const primary = byToken.get('primary')!
    expect(primary.derived).toBe(true)
    expect(primary.light).toBe(primary.dark)
    expect(primary.light).toBe(
      formatThemeColor(resolveThemeColorValue(COLOR_THEMES.sky.primary!, {}))
    )
    expect(byToken.get('background')).toMatchObject({ derived: true })
    expect(byToken.get('secondary')).toMatchObject({ derived: true })
    expect(byToken.get('card-foreground')).toMatchObject({ derived: true })
    expect(byToken.get('accent')!.light).toMatch(/^#[0-9a-f]{8}$/)
    expect(byToken.get('destructive')).toMatchObject({ derived: false })
    expect(byToken.get('chart-1')).toMatchObject({ derived: false })
  })

  test('the default widget scope uses the inverted widget surface', async () => {
    const rows = resolveWorkspaceThemeTokens(await loadThemeTokenSource(), undefined, 'widget')
    const byToken = new Map(rows.map(row => [row.token, row]))

    expect(byToken.get('background')).toMatchObject({
      light: formatThemeColor(resolveThemeColorValue(DEFAULT_PRIMARY_COLOR, {})),
      dark: formatThemeColor(resolveThemeColorValue(DEFAULT_PRIMARY_COLOR, {})),
      derived: true
    })
    expect(byToken.get('foreground')).toMatchObject({
      light: '#ffffff',
      dark: '#ffffff',
      derived: true
    })
    expect(byToken.get('primary')).toMatchObject({
      light: '#f8f8f8',
      dark: '#f8f8f8',
      derived: true
    })
    expect(byToken.get('chart-1')).toMatchObject({ derived: false })
  })

  test('every preset resolves every token in both scopes to hex', async () => {
    const source = await loadThemeTokenSource()
    const presets = Object.keys(COLOR_THEMES) as ColorTheme[]
    for (const scope of ['view', 'widget'] as const) {
      for (const color of presets) {
        for (const row of resolveWorkspaceThemeTokens(source, { color }, scope)) {
          expect(row.light).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
          expect(row.dark).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
        }
      }
    }
  })

  test('adds token context when a CSS value cannot be resolved', () => {
    expect(() =>
      resolveWorkspaceThemeTokens(
        {
          tokens: ['background'],
          light: { background: 'light-dark(white, black)' },
          dark: { background: 'black' }
        },
        undefined,
        'view'
      )
    ).toThrow(
      'Could not resolve --background for view light: Unsupported theme color value: light-dark(white, black)'
    )
  })
})
