// Resolves the workspace theme's semantic color tokens to concrete values for
// `moi theme --tokens`. CSS owns the base light/dark values and the semantic
// token list; lib/themes.ts owns the runtime view/widget overrides. This module
// reads both sources and evaluates the constrained color grammar they use.
import { formatHex, formatHex8, parse, rgb } from 'culori'
import { join } from 'path'
import postcss from 'postcss'

import { resolveThemeColorOverrides, themeColorProperty } from '@/lib/themes'
import type { ThemeColorMode, WorkspaceTheme } from '@/lib/themes'

const INDEX_CSS_PATH = join(import.meta.dir, '..', 'client', 'index.css')
const THEME_CSS_PATH = join(import.meta.dir, '..', 'client', 'theme.css')

export type ThemeTokenScope = 'view' | 'widget'

export type ThemeTokenSource = {
  tokens: string[]
  light: Record<string, string>
  dark: Record<string, string>
}

type Rgba = { r: number; g: number; b: number; alpha: number }

function setUniqueToken(
  target: Record<string, string>,
  token: string,
  value: string,
  source: string
): void {
  if (Object.hasOwn(target, token)) {
    throw new Error(`Duplicate --${token} declaration in ${source}`)
  }
  target[token] = value
}

function parseModeTokens(css: string, selector: ':root' | '.dark'): Record<string, string> {
  const root = postcss.parse(css)
  const tokens: Record<string, string> = {}
  let matched = false

  root.each(node => {
    if (node.type !== 'rule' || node.selector !== selector) return
    matched = true
    node.each(child => {
      if (child.type !== 'decl' || !child.prop.startsWith('--')) return
      setUniqueToken(tokens, child.prop.slice(2), child.value, selector)
    })
  })

  if (!matched) throw new Error(`Missing top-level ${selector} theme declarations`)
  return tokens
}

function parseSemanticTokenNames(css: string): string[] {
  const root = postcss.parse(css)
  const tokens: string[] = []
  const seen = new Set<string>()

  root.walkAtRules('theme', atRule => {
    if (atRule.params.trim() !== 'inline') return
    atRule.walkDecls(declaration => {
      if (!declaration.prop.startsWith('--color-')) return
      const token = declaration.prop.slice('--color-'.length)
      const reference = /^var\(\s*--([\w-]+)\s*\)$/.exec(declaration.value.trim())
      if (!reference || reference[1] !== token) {
        throw new Error(
          `${declaration.prop} must map directly to var(--${token}) in client/theme.css`
        )
      }
      if (seen.has(token)) throw new Error(`Duplicate semantic color token --${token}`)
      seen.add(token)
      tokens.push(token)
    })
  })

  if (tokens.length === 0) throw new Error('No semantic color tokens found in client/theme.css')
  return tokens
}

export function parseThemeTokenSource(indexCss: string, themeCss: string): ThemeTokenSource {
  const tokens = parseSemanticTokenNames(themeCss)
  const rootLight = parseModeTokens(indexCss, ':root')
  const rootDark = parseModeTokens(indexCss, '.dark')
  const light: Record<string, string> = {}
  const dark: Record<string, string> = {}

  for (const token of tokens) {
    if (!Object.hasOwn(rootLight, token)) {
      throw new Error(`Semantic color token --${token} is missing from :root`)
    }
    if (!Object.hasOwn(rootDark, token)) {
      throw new Error(`Semantic color token --${token} is missing from .dark`)
    }
    light[token] = rootLight[token]
    dark[token] = rootDark[token]
  }

  return { tokens, light, dark }
}

export async function loadThemeTokenSource(): Promise<ThemeTokenSource> {
  const [indexCss, themeCss] = await Promise.all([
    Bun.file(INDEX_CSS_PATH).text(),
    Bun.file(THEME_CSS_PATH).text()
  ])
  return parseThemeTokenSource(indexCss, themeCss)
}

function parseColor(value: string): Rgba | null {
  const parsed = rgb(parse(value.trim()))
  if (!parsed) return null
  return { r: parsed.r, g: parsed.g, b: parsed.b, alpha: parsed.alpha ?? 1 }
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of input) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (depth < 0) throw new Error(`Unbalanced color expression: ${input}`)
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (depth !== 0) throw new Error(`Unbalanced color expression: ${input}`)
  if (current.trim()) parts.push(current.trim())
  return parts
}

function mixSrgb(c1: Rgba, w1: number, c2: Rgba, w2: number): Rgba {
  const sum = w1 + w2
  if (!Number.isFinite(sum) || sum <= 0 || w1 < 0 || w2 < 0) {
    throw new Error(`Invalid color-mix percentages: ${w1}% and ${w2}%`)
  }
  const n1 = w1 / sum
  const n2 = w2 / sum
  const multiplier = Math.min(sum / 100, 1)
  const mixedAlpha = n1 * c1.alpha + n2 * c2.alpha
  const alpha = mixedAlpha * multiplier
  const channel = (a: number, b: number) =>
    mixedAlpha === 0 ? 0 : (n1 * c1.alpha * a + n2 * c2.alpha * b) / mixedAlpha
  return { r: channel(c1.r, c2.r), g: channel(c1.g, c2.g), b: channel(c1.b, c2.b), alpha }
}

export function resolveThemeColorValue(
  value: string,
  tokens: Record<string, string>,
  references: readonly string[] = []
): Rgba {
  const trimmed = value.trim()
  const varMatch = /^var\(--([\w-]+)\)$/.exec(trimmed)
  if (varMatch) {
    const token = varMatch[1]
    if (references.includes(token)) {
      throw new Error(
        `Circular theme token reference: ${[...references, token]
          .map(reference => `--${reference}`)
          .join(' -> ')}`
      )
    }
    const next = tokens[token]
    if (next === undefined) throw new Error(`Unknown theme token reference --${token}`)
    return resolveThemeColorValue(next, tokens, [...references, token])
  }

  if (trimmed.startsWith('color-mix(')) {
    if (!trimmed.endsWith(')')) throw new Error(`Unsupported theme color value: ${trimmed}`)
    const inner = trimmed.slice('color-mix('.length, -1)
    const [space, ...components] = splitTopLevel(inner)
    if (space !== 'in srgb' || components.length !== 2) {
      throw new Error(`Unsupported theme color value: ${trimmed}`)
    }
    const resolved = components.map(component => {
      const match = /^(.*?)\s*([\d.]+)%$/.exec(component)
      const color = resolveThemeColorValue(match ? match[1] : component, tokens, references)
      return { color, weight: match ? Number(match[2]) : null }
    })
    const [a, b] = resolved
    const w1 = a.weight ?? (b.weight !== null ? 100 - b.weight : 50)
    const w2 = b.weight ?? 100 - w1
    return mixSrgb(a.color, w1, b.color, w2)
  }

  const color = parseColor(trimmed)
  if (!color) throw new Error(`Unsupported theme color value: ${trimmed}`)
  return color
}

export function formatThemeColor(color: Rgba): string {
  const value = { mode: 'rgb', ...color } as const
  return color.alpha >= 1 ? formatHex(value) : formatHex8(value)
}

export type ResolvedThemeToken = {
  token: string
  light: string
  dark: string
  derived: boolean
}

function colorModeForScope(scope: ThemeTokenScope): ThemeColorMode {
  return scope === 'view' ? 'workspace' : 'widget'
}

function tokenDependsOnOverride(
  token: string,
  tokens: Record<string, string>,
  overrideTokens: ReadonlySet<string>,
  references: readonly string[] = []
): boolean {
  if (overrideTokens.has(token)) return true
  if (references.includes(token)) {
    throw new Error(
      `Circular theme token reference: ${[...references, token]
        .map(reference => `--${reference}`)
        .join(' -> ')}`
    )
  }
  const value = tokens[token]
  if (value === undefined) throw new Error(`Unknown theme token reference --${token}`)
  const dependencies = [...value.matchAll(/var\(--([\w-]+)\)/g)].map(match => match[1])
  return dependencies.some(dependency =>
    tokenDependsOnOverride(dependency, tokens, overrideTokens, [...references, token])
  )
}

export function resolveWorkspaceThemeTokens(
  source: ThemeTokenSource,
  theme: Partial<WorkspaceTheme> | undefined,
  scope: ThemeTokenScope
): ResolvedThemeToken[] {
  const overrides: Record<string, string> = {}
  const colors = resolveThemeColorOverrides(theme, colorModeForScope(scope))
  if (colors) {
    for (const [token, value] of Object.entries(colors)) {
      overrides[themeColorProperty(token).slice(2)] = value
    }
  }
  const overrideTokens = new Set(Object.keys(overrides))

  return source.tokens.map(token => {
    const resolveMode = (mode: 'light' | 'dark') => {
      const tokens = { ...source[mode], ...overrides }
      try {
        return {
          value: formatThemeColor(resolveThemeColorValue(tokens[token], tokens, [token])),
          derived: tokenDependsOnOverride(token, tokens, overrideTokens)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Could not resolve --${token} for ${scope} ${mode}: ${message}`)
      }
    }
    const light = resolveMode('light')
    const dark = resolveMode('dark')
    return {
      token,
      light: light.value,
      dark: dark.value,
      derived: light.derived || dark.derived
    }
  })
}
