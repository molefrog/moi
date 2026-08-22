// Resolves the workspace theme's semantic color tokens to concrete values for
// `moi theme tokens`. The browser resolves these live from CSS (client/index.css
// `:root`/`.dark` defaults + the inline overrides useWorkspaceTheme sets from
// the color preset); the CLI has no CSS engine, so this module mirrors that
// cascade: base defaults below, preset derivations from lib/themes.ts on top,
// then a small evaluator for the two value forms the theme uses — `var(--x)`
// references and `color-mix(in srgb, …)`.
import { formatHex, formatHex8, parse, rgb } from 'culori'

import { COLOR_THEMES, deriveThemeColors, resolveWorkspaceTheme } from '@/lib/themes'
import type { WorkspaceTheme } from '@/lib/themes'

// The `:root` / `.dark` color tokens from client/index.css, verbatim. Kept in
// sync by a test that parses that file (theme-tokens.test.ts) — edit the CSS
// first, then mirror it here.
export const THEME_BASE_TOKENS: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    background: 'oklch(1 0 0)',
    foreground: 'oklch(0.145 0 0)',
    card: 'oklch(1 0 0)',
    'card-foreground': 'var(--foreground)',
    popover: 'oklch(1 0 0)',
    'popover-foreground': 'var(--foreground)',
    primary: 'oklch(0.205 0 0)',
    'primary-foreground': 'oklch(0.985 0 0)',
    muted: 'oklch(0.97 0 0)',
    'muted-foreground': 'oklch(0.64 0 0)',
    accent: 'oklch(0 0 0 / 0.07)',
    'accent-foreground': 'var(--foreground)',
    success: 'oklch(0.527 0.154 150.069)',
    destructive: 'oklch(0.58 0.22 27)',
    border: 'oklch(0 0 0 / 0.07)',
    input: 'oklch(0.922 0 0)',
    ring: 'oklch(0.708 0 0)',
    secondary: 'var(--accent)',
    'secondary-foreground': 'var(--accent-foreground)',
    'chart-1': 'oklch(0.646 0.222 41.116)',
    'chart-2': 'oklch(0.6 0.118 184.704)',
    'chart-3': 'oklch(0.398 0.07 227.392)',
    'chart-4': 'oklch(0.828 0.189 84.429)',
    'chart-5': 'oklch(0.769 0.188 70.08)'
  },
  dark: {
    background: 'oklch(0.145 0 0)',
    foreground: 'oklch(0.985 0 0)',
    card: 'oklch(0.205 0 0)',
    'card-foreground': 'var(--foreground)',
    popover: 'oklch(0.205 0 0)',
    'popover-foreground': 'var(--foreground)',
    primary: 'oklch(0.985 0 0)',
    'primary-foreground': 'oklch(0.205 0 0)',
    muted: 'oklch(0.269 0 0)',
    'muted-foreground': 'oklch(0.708 0 0)',
    accent: 'oklch(1 0 0 / 0.1)',
    'accent-foreground': 'var(--foreground)',
    success: 'oklch(0.627 0.194 149.214)',
    destructive: 'oklch(0.58 0.22 27)',
    border: 'oklch(1 0 0 / 0.1)',
    input: 'oklch(0.35 0 0)',
    ring: 'oklch(0.556 0 0)',
    secondary: 'var(--accent)',
    'secondary-foreground': 'var(--accent-foreground)',
    'chart-1': 'oklch(0.488 0.243 264.376)',
    'chart-2': 'oklch(0.696 0.17 162.48)',
    'chart-3': 'oklch(0.769 0.188 70.08)',
    'chart-4': 'oklch(0.627 0.265 303.9)',
    'chart-5': 'oklch(0.645 0.246 16.439)'
  }
}

export const THEME_TOKEN_NAMES = Object.keys(THEME_BASE_TOKENS.light)

type Rgba = { r: number; g: number; b: number; alpha: number }

function parseColor(value: string): Rgba | null {
  const parsed = rgb(parse(value.trim()))
  if (!parsed) return null
  return { r: parsed.r, g: parsed.g, b: parsed.b, alpha: parsed.alpha ?? 1 }
}

// Split `color-mix` arguments at top-level commas (a component may itself
// contain commas inside `var()`/`color-mix()` parens).
function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of input) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

// CSS color-mix in srgb with premultiplied alpha, per spec — including the
// alpha multiplier when the percentages sum below 100% (the accent derivation
// is `4% primary, 4% foreground`, a translucent tint). Only the srgb
// interpolation space is supported — it is the only one the theme uses.
function mixSrgb(c1: Rgba, w1: number, c2: Rgba, w2: number): Rgba {
  const sum = w1 + w2
  const n1 = w1 / sum
  const n2 = w2 / sum
  const multiplier = Math.min(sum / 100, 1)
  const alpha = (n1 * c1.alpha + n2 * c2.alpha) * multiplier
  const channel = (a: number, b: number) =>
    alpha === 0 ? 0 : (n1 * c1.alpha * a + n2 * c2.alpha * b) / (n1 * c1.alpha + n2 * c2.alpha)
  return { r: channel(c1.r, c2.r), g: channel(c1.g, c2.g), b: channel(c1.b, c2.b), alpha }
}

// Resolve one CSS color value against a token map: follows `var(--x)`
// references, evaluates `color-mix(in srgb, …)`, parses everything else with
// culori. Returns null for values it cannot resolve (unknown var, unsupported
// space) rather than guessing.
export function resolveThemeColorValue(value: string, tokens: Record<string, string>): Rgba | null {
  const trimmed = value.trim()

  const varMatch = /^var\(--([\w-]+)\)$/.exec(trimmed)
  if (varMatch) {
    const next = tokens[varMatch[1]]
    return next ? resolveThemeColorValue(next, tokens) : null
  }

  if (trimmed.startsWith('color-mix(')) {
    const inner = trimmed.slice('color-mix('.length, -1)
    const [space, ...components] = splitTopLevel(inner)
    if (space !== 'in srgb' || components.length !== 2) return null
    const resolved = components.map(component => {
      const match = /^(.*?)\s*([\d.]+)%$/.exec(component)
      const color = resolveThemeColorValue(match ? match[1] : component, tokens)
      return color ? { color, weight: match ? Number(match[2]) : null } : null
    })
    const [a, b] = resolved
    if (!a || !b) return null
    const w1 = a.weight ?? (b.weight !== null ? 100 - b.weight : 50)
    const w2 = b.weight ?? 100 - w1
    return mixSrgb(a.color, w1, b.color, w2)
  }

  return parseColor(trimmed)
}

export function formatThemeColor(color: Rgba): string {
  const value = { mode: 'rgb', ...color } as const
  return color.alpha >= 1 ? formatHex(value) : formatHex8(value)
}

export type ResolvedThemeToken = {
  token: string
  light: string
  dark: string
  // Whether the value follows the color preset's primary — directly derived,
  // or reached through a var() chain into a derived token (secondary → accent,
  // card-foreground → foreground) — vs a stock default from client/index.css.
  derived: boolean
}

// The token table for `moi theme tokens`: the base cascade with the workspace
// color preset's derivations applied on top, every value resolved to hex.
export function resolveWorkspaceThemeTokens(theme?: Partial<WorkspaceTheme>): ResolvedThemeToken[] {
  const resolved = resolveWorkspaceTheme(theme)
  const primary = COLOR_THEMES[resolved.color]?.primary
  const overrides: Record<string, string> = {}
  if (primary) {
    for (const [token, value] of Object.entries(deriveThemeColors(primary))) {
      overrides[token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)] = value
    }
  }

  return THEME_TOKEN_NAMES.map(token => {
    const format = (mode: 'light' | 'dark', withOverrides: boolean) => {
      const tokens = withOverrides
        ? { ...THEME_BASE_TOKENS[mode], ...overrides }
        : THEME_BASE_TOKENS[mode]
      const color = resolveThemeColorValue(tokens[token], tokens)
      return color ? formatThemeColor(color) : tokens[token]
    }
    const light = format('light', true)
    const dark = format('dark', true)
    return {
      token,
      light,
      dark,
      derived: light !== format('light', false) || dark !== format('dark', false)
    }
  })
}
