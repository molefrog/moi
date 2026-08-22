import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import { COLOR_THEMES } from '@/lib/themes'

import {
  THEME_BASE_TOKENS,
  THEME_TOKEN_NAMES,
  formatThemeColor,
  resolveThemeColorValue,
  resolveWorkspaceThemeTokens
} from '../theme-tokens'

describe('resolveThemeColorValue', () => {
  const tokens = {
    primary: 'oklch(0.205 0 0)',
    foreground: 'oklch(0.145 0 0)',
    accent: 'oklch(0 0 0 / 0.07)',
    secondary: 'var(--accent)'
  }

  test('parses plain colors', () => {
    const color = resolveThemeColorValue('oklch(1 0 0)', tokens)!
    expect(formatThemeColor(color)).toBe('#ffffff')
  })

  test('follows var chains', () => {
    const color = resolveThemeColorValue('var(--secondary)', tokens)!
    expect(color.alpha).toBeCloseTo(0.07)
    expect(formatThemeColor(color)).toBe('#00000012')
  })

  test('evaluates color-mix with transparent', () => {
    const color = resolveThemeColorValue(
      'color-mix(in srgb, var(--foreground) 7%, transparent)',
      tokens
    )!
    expect(color.alpha).toBeCloseTo(0.07)
  })

  test('evaluates color-mix between two colors', () => {
    const color = resolveThemeColorValue('color-mix(in srgb, white 50%, black 50%)', tokens)!
    expect(color.alpha).toBe(1)
    expect(color.r).toBeCloseTo(0.5)
  })

  test('scales alpha when percentages sum below 100% (accent derivation)', () => {
    const color = resolveThemeColorValue(
      'color-mix(in srgb, var(--primary) 4%, var(--foreground) 4%)',
      tokens
    )!
    expect(color.alpha).toBeCloseTo(0.08)
  })

  test('returns null for unknown vars instead of guessing', () => {
    expect(resolveThemeColorValue('var(--nope)', tokens)).toBeNull()
  })
})

describe('resolveWorkspaceThemeTokens', () => {
  test('default preset reveals the stock values, nothing derived', () => {
    const rows = resolveWorkspaceThemeTokens(undefined)
    const byToken = new Map(rows.map(row => [row.token, row]))

    expect(rows.every(row => !row.derived)).toBe(true)
    expect(byToken.get('background')).toMatchObject({ light: '#ffffff' })
    // chart tokens differ between light and dark stock palettes.
    const chart1 = byToken.get('chart-1')!
    expect(chart1.light).not.toBe(chart1.dark)
    expect(chart1.light).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('a color preset derives its token set from the primary', () => {
    const rows = resolveWorkspaceThemeTokens({ color: 'sky' })
    const byToken = new Map(rows.map(row => [row.token, row]))

    const primary = byToken.get('primary')!
    expect(primary.derived).toBe(true)
    // Derived tokens override both modes identically (inline style wins).
    expect(primary.light).toBe(primary.dark)
    expect(primary.light).toBe(
      formatThemeColor(resolveThemeColorValue(COLOR_THEMES.sky.primary!, {})!)
    )
    // Background is a 3% primary tint — near-white, not pure white.
    const background = byToken.get('background')!
    expect(background.derived).toBe(true)
    expect(background.light).not.toBe('#ffffff')
    // Tokens that only reference derived tokens through var() chains follow
    // the preset too.
    expect(byToken.get('secondary')!.derived).toBe(true)
    expect(byToken.get('card-foreground')!.derived).toBe(true)
    // Accent is a translucent 4%+4% tint, not a solid color.
    expect(byToken.get('accent')!.light).toMatch(/^#[0-9a-f]{8}$/)
    // Non-derived tokens keep the stock defaults.
    expect(byToken.get('destructive')!.derived).toBe(false)
    expect(byToken.get('chart-1')!.derived).toBe(false)
  })

  test('every token resolves to a concrete hex value', () => {
    for (const preset of Object.keys(COLOR_THEMES)) {
      for (const row of resolveWorkspaceThemeTokens({ color: preset as never })) {
        expect(row.light).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
        expect(row.dark).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
      }
    }
  })
})

// The base token map mirrors client/index.css by hand; this guard fails when
// the CSS moves and the mirror does not.
describe('base tokens stay in sync with client/index.css', () => {
  test('every token matches its :root / .dark declaration', async () => {
    const css = await Bun.file(join(import.meta.dir, '../../client/index.css')).text()
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'))
    const darkBlock = css.slice(css.indexOf('.dark {'))

    const cssValue = (block: string, token: string) => {
      const match = new RegExp(`--${token}:\\s*([^;]+);`).exec(block)
      return match?.[1].trim()
    }

    for (const token of THEME_TOKEN_NAMES) {
      expect(THEME_BASE_TOKENS.light[token]).toBe(cssValue(rootBlock, token)!)
      expect(THEME_BASE_TOKENS.dark[token]).toBe(cssValue(darkBlock, token)!)
    }
  })
})
