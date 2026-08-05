import { wcagLuminance } from 'culori'

export type FontTheme = 'default' | 'serif' | 'mono' | 'blobby' | 'geometric' | 'awkward'

export type FontThemeConfig = {
  label: string
  feel: string
  sans: string
  mono: string
  googleFontsQuery?: string // passed as `family=` param to Google Fonts API
}

export const FONT_THEMES: Record<FontTheme, FontThemeConfig> = {
  default: {
    label: 'Default',
    feel: 'System font',
    sans: 'system-ui',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500'
  },
  serif: {
    label: 'Serif',
    feel: 'Literata',
    sans: 'Literata',
    mono: 'Geist Mono',
    googleFontsQuery: 'Literata:wght@400;600;700&family=Geist+Mono:wght@400;500'
  },
  mono: {
    label: 'Mono',
    feel: 'Geist Mono',
    sans: 'Geist Mono',
    mono: 'Geist Mono',
    googleFontsQuery: 'Geist+Mono:wght@400;500;600'
  },
  blobby: {
    label: 'Blobby',
    feel: 'Sour Gummy',
    sans: 'Sour Gummy',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Sour+Gummy:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  geometric: {
    label: 'Geometric',
    feel: 'Manrope',
    sans: 'Manrope',
    mono: 'Geist Mono',
    googleFontsQuery: 'Manrope:wght@400;500;600&family=Geist+Mono:wght@400;500'
  },
  awkward: {
    label: 'Awkward',
    feel: 'Averia Sans Libre',
    sans: 'Averia Sans Libre',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Averia+Sans+Libre:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  }
}

export type RadiusTheme = 'squishy' | 'rounded' | 'subtle' | 'square'

export type RadiusThemeConfig = {
  label: string
  radius: string
}

export const RADIUS_THEMES: Record<RadiusTheme, RadiusThemeConfig> = {
  squishy: { label: 'Squishy', radius: '0.875rem' },
  rounded: { label: 'Rounded', radius: '0.625rem' },
  subtle: { label: 'Subtle', radius: '0.375rem' },
  square: { label: 'Square', radius: '0' }
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

function foregroundForPrimary(primary: string): string {
  return wcagLuminance(primary) > 0.3 ? 'oklch(0 0 0)' : 'oklch(1 0 0)'
}

const THEME_COLOR_DERIVATIONS = {
  primary: primary => primary,
  primaryForeground: primary => foregroundForPrimary(primary),
  background: () => 'color-mix(in oklch, var(--primary) 3%, oklch(1 0 0) 97%)',
  foreground: () => 'color-mix(in oklch, var(--primary) 24%, oklch(0 0 0) 76%)',
  muted: () => 'color-mix(in oklch, var(--background) 95%, var(--foreground) 5%)',
  mutedForeground: () => 'color-mix(in oklch, var(--background) 58%, var(--foreground) 42%)',
  accent: () => 'color-mix(in oklch, var(--primary) 4%, var(--foreground) 4%)'
} satisfies Record<string, (primary: string) => string>

export type ThemeColorToken = keyof typeof THEME_COLOR_DERIVATIONS
export type ThemeColors = Record<ThemeColorToken, string>

export type ColorThemeConfig = {
  label: string
  // undefined primary = no override, reveals :root defaults
  primary?: string
}

export const THEME_COLOR_TOKENS = Object.keys(THEME_COLOR_DERIVATIONS) as ThemeColorToken[]

export function deriveThemeColors(primary: string): ThemeColors {
  const colors = {} as ThemeColors
  for (const token of THEME_COLOR_TOKENS) {
    colors[token] = THEME_COLOR_DERIVATIONS[token](primary)
  }
  return colors
}

export const COLOR_THEMES: Record<ColorTheme, ColorThemeConfig> = {
  default: { label: 'Default' },
  paper: {
    label: 'Paper',
    primary: 'oklch(0.3413 0.0393 72.10)'
  },
  rose: {
    label: 'Rose',
    primary: 'oklch(0.6322 0.2171 26.02)'
  },
  tangerine: {
    label: 'Tangerine',
    primary: 'oklch(0.6886 0.259 37.15)'
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
}

export const DEFAULT_WORKSPACE_THEME: WorkspaceTheme = {
  font: 'default',
  color: 'default',
  radius: 'rounded'
}

export function resolveWorkspaceTheme(theme?: Partial<WorkspaceTheme>): WorkspaceTheme {
  return { ...DEFAULT_WORKSPACE_THEME, ...theme }
}
