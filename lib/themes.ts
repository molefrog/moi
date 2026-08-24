import type { TraitOverrides } from 'blobatar'
import { wcagLuminance } from 'culori'

export type FontTheme =
  | 'sans'
  | 'serif'
  | 'mono'
  | 'geometric'
  | 'rounded'
  | 'blobby'
  | 'awkward'
  | 'comic'

export type FontThemeConfig = {
  label: string
  sans: string
  mono: string
  googleFontsQuery?: string // passed as `family=` param to Google Fonts API
}

export const FONT_THEMES: Record<FontTheme, FontThemeConfig> = {
  sans: {
    label: 'Sans',
    sans: 'system-ui',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500'
  },
  serif: {
    label: 'Serif',
    sans: 'Literata',
    mono: 'Geist Mono',
    googleFontsQuery: 'Literata:wght@400;600;700&family=Geist+Mono:wght@400;500'
  },
  mono: {
    label: 'Mono',
    sans: 'Geist Mono',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500;600'
  },
  geometric: {
    label: 'Geometric',
    sans: 'Manrope',
    mono: 'Geist Mono',
    googleFontsQuery: 'Manrope:wght@400;500;600&family=Geist+Mono:wght@400;500'
  },
  rounded: {
    label: 'Rounded',
    sans: 'SN Pro',
    mono: 'Geist Mono',
    googleFontsQuery: 'SN+Pro:wght@400;500;600&family=Geist+Mono:wght@400;500'
  },
  blobby: {
    label: 'Blobby',
    sans: 'Sour Gummy',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Sour+Gummy:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  awkward: {
    label: 'Awkward',
    sans: 'Averia Sans Libre',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Averia+Sans+Libre:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  comic: {
    label: 'Comic',
    sans: 'Comic Sans MS, Comic Sans, cursive',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500'
  }
}

export type RadiusTheme = 'squishy' | 'soft' | 'subtle' | 'square'

export type RadiusThemeConfig = {
  label: string
  radius: string
}

export const RADIUS_THEMES: Record<RadiusTheme, RadiusThemeConfig> = {
  squishy: { label: 'Squishy', radius: '0.875rem' },
  soft: { label: 'Soft', radius: '0.625rem' },
  subtle: { label: 'Subtle', radius: '0.375rem' },
  square: { label: 'Square', radius: '0' }
}

export type AgentTheme = 'blob' | 'boxy' | 'pill' | 'dorito'

export type AgentThemeConfig = {
  label: string
  traits: TraitOverrides
}

export const AGENT_THEMES: Record<AgentTheme, AgentThemeConfig> = {
  blob: { label: 'Blob', traits: { shape: 0.11, 'body.r': 0.5, 'body.ratio': 0, 'body.n': 0.5 } },
  boxy: { label: 'Boxy', traits: { shape: 0.54, 'body.r': 1, 'body.ratio': 0 } },
  pill: { label: 'Pill', traits: { shape: 0.65, 'body.r': 1 } },
  dorito: { label: 'Dorito', traits: { shape: 0.99, 'body.r': 1, 'body.ratio': 0, 'body.rot': 0 } }
}

export type ColorTheme =
  | 'default'
  | 'paper'
  | 'rose'
  | 'tangerine'
  | 'sand'
  | 'mint'
  | 'sky'
  | 'lavender'

export type ThemeColorMode = 'workspace' | 'widget'

export const DEFAULT_PRIMARY_COLOR = 'oklch(0.205 0 0)'

function foregroundForPrimary(primary: string): string {
  return wcagLuminance(primary) > 0.3 ? 'oklch(0 0 0)' : 'oklch(1 0 0)'
}

const THEME_COLOR_DERIVATIONS = {
  workspace: {
    primary: primary => primary,
    primaryForeground: primary => foregroundForPrimary(primary),
    background: () => 'color-mix(in srgb, var(--primary) 3%, oklch(1 0 0) 97%)',
    foreground: () => 'color-mix(in srgb, var(--primary) 20%, oklch(0 0 0) 80%)',
    muted: () => 'color-mix(in srgb, var(--background) 97%, var(--foreground) 3%)',
    mutedForeground: () => 'color-mix(in srgb, var(--background) 50%, var(--foreground) 50%)',
    accent: () => 'color-mix(in srgb, var(--primary) 4%, var(--foreground) 4%)',
    accentForeground: () => 'var(--foreground)',
    border: () => 'color-mix(in srgb, var(--foreground) 7%, transparent)',
    ring: () => 'color-mix(in srgb, var(--background) 50%, var(--primary) 50%)'
  },
  widget: {
    background: primary => primary,
    foreground: primary => foregroundForPrimary(primary),
    primary: () => 'color-mix(in srgb, var(--background) 3%, oklch(1 0 0) 97%)',
    primaryForeground: () => 'color-mix(in srgb, var(--background) 20%, oklch(0 0 0) 80%)',
    muted: () => 'color-mix(in srgb, var(--background) 97%, var(--foreground) 3%)',
    mutedForeground: () => 'color-mix(in srgb, var(--background) 50%, var(--foreground) 50%)',
    accent: () => 'color-mix(in srgb, var(--primary) 4%, var(--foreground) 4%)',
    accentForeground: () => 'var(--foreground)',
    border: () => 'color-mix(in srgb, var(--foreground) 15%, transparent)',
    ring: () => 'color-mix(in srgb, var(--background) 50%, var(--primary) 50%)'
  }
} satisfies Record<ThemeColorMode, Record<string, (primary: string) => string>>

export type ThemeColorToken = keyof (typeof THEME_COLOR_DERIVATIONS)['workspace']
export type ThemeColors = Record<ThemeColorToken, string>

export type ColorThemeConfig = {
  label: string
  // undefined primary = no override, reveals :root defaults
  primary?: string
}

export const THEME_COLOR_TOKENS = Object.keys(
  THEME_COLOR_DERIVATIONS.workspace
) as ThemeColorToken[]

export function themeColorProperty(token: ThemeColorToken): `--${string}` {
  const name = token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return `--${name}`
}

export function deriveThemeColors(
  primary: string,
  mode: ThemeColorMode = 'workspace'
): ThemeColors {
  const colors = {} as ThemeColors
  const derivations = THEME_COLOR_DERIVATIONS[mode]
  for (const token of THEME_COLOR_TOKENS) {
    colors[token] = derivations[token](primary)
  }
  return colors
}

export const COLOR_THEMES: Record<ColorTheme, ColorThemeConfig> = {
  default: { label: 'Default' },
  paper: {
    label: 'Paper',
    primary: 'oklch(0.4328 0.0351 66.67)'
  },
  rose: {
    label: 'Rose',
    primary: 'oklch(0.6322 0.2171 26.02)'
  },
  tangerine: {
    label: 'Tangerine',
    primary: 'oklch(0.6886 0.22 37.15)'
  },
  sand: {
    label: 'Sand',
    primary: 'oklch(0.8334 0.1271 67.80)'
  },
  mint: {
    label: 'Tropics',
    primary: 'oklch(0.5774 0.1399 156.06)'
  },
  sky: {
    label: 'Sky',
    primary: 'oklch(0.5824 0.1830 253.59)'
  },
  lavender: {
    label: 'Lavender',
    primary: 'oklch(0.6025 0.2426 294.58)'
  }
}

export type WorkspaceTheme = {
  font: FontTheme
  color: ColorTheme
  radius: RadiusTheme
  agent: AgentTheme
}

export const DEFAULT_WORKSPACE_THEME: WorkspaceTheme = {
  font: 'sans',
  color: 'default',
  radius: 'soft',
  agent: 'boxy'
}

function resolveThemePreset<T extends string>(
  value: unknown,
  presets: Record<T, unknown>,
  fallback: T
): T {
  return typeof value === 'string' && Object.hasOwn(presets, value) ? (value as T) : fallback
}

export function resolveWorkspaceTheme(theme?: Partial<WorkspaceTheme>): WorkspaceTheme {
  return {
    font: resolveThemePreset(theme?.font, FONT_THEMES, DEFAULT_WORKSPACE_THEME.font),
    color: resolveThemePreset(theme?.color, COLOR_THEMES, DEFAULT_WORKSPACE_THEME.color),
    radius: resolveThemePreset(theme?.radius, RADIUS_THEMES, DEFAULT_WORKSPACE_THEME.radius),
    agent: resolveThemePreset(theme?.agent, AGENT_THEMES, DEFAULT_WORKSPACE_THEME.agent)
  }
}

export function resolveThemeColorOverrides(
  theme?: Partial<WorkspaceTheme>,
  mode: ThemeColorMode = 'workspace'
): ThemeColors | undefined {
  const resolved = resolveWorkspaceTheme(theme)
  const color = COLOR_THEMES[resolved.color]
  const primary = color.primary ?? (mode === 'widget' ? DEFAULT_PRIMARY_COLOR : undefined)
  return primary ? deriveThemeColors(primary, mode) : undefined
}
