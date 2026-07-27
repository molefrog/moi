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
    mono: 'JetBrains Mono',
    googleFontsQuery: 'JetBrains+Mono:wght@400;500'
  },
  serif: {
    label: 'Serif',
    feel: 'Literata',
    sans: 'Literata',
    mono: 'JetBrains Mono',
    googleFontsQuery: 'Literata:wght@400;600;700&family=JetBrains+Mono:wght@400;500'
  },
  mono: {
    label: 'Mono',
    feel: 'JetBrains Mono',
    sans: 'JetBrains Mono',
    mono: 'JetBrains Mono',
    googleFontsQuery: 'JetBrains+Mono:wght@400;500;600'
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
    mono: 'JetBrains Mono',
    googleFontsQuery: 'Manrope:wght@400;500;600&family=DM+Mono:wght@400;500'
  },
  awkward: {
    label: 'Awkward',
    feel: 'Averia Sans Libre',
    sans: 'Averia Sans Libre',
    mono: 'Azeret Mono',
    googleFontsQuery: 'Averia+Sans+Libre:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  }
}

export type ColorTheme = 'default' | 'paper' | 'sand' | 'rose' | 'lavender' | 'mint' | 'sky'

type ThemeColorSource = {
  background: string
}

const THEME_COLOR_DERIVATIONS = {
  background: ({ background }) => background,
  foreground: ({ background }) =>
    `color-mix(in oklch, oklch(from ${background} l calc(c * 10) h) 32%, black 68%)`,
  muted: () => 'color-mix(in oklch, var(--background) 95%, var(--foreground) 5%)',
  mutedForeground: () => 'color-mix(in oklch, var(--background) 58%, var(--foreground) 42%)',
  accent: () =>
    'color-mix(in oklch, oklch(from var(--background) l calc(c * 10) h) 6%, var(--foreground) 6%)'
} satisfies Record<string, (source: ThemeColorSource) => string>

export type ThemeColorToken = keyof typeof THEME_COLOR_DERIVATIONS
export type ThemeColors = Record<ThemeColorToken, string>
export type ThemeColorOverrides = Partial<ThemeColors>

export type ColorThemeConfig = {
  label: string
  // undefined colors = no override, reveals :root defaults
} & ThemeColorOverrides

export const THEME_COLOR_TOKENS = Object.keys(THEME_COLOR_DERIVATIONS) as ThemeColorToken[]

export function getThemeColorOverrides(
  theme: ThemeColorOverrides | undefined
): ThemeColorOverrides {
  const overrides: ThemeColorOverrides = {}
  for (const token of THEME_COLOR_TOKENS) {
    overrides[token] = theme?.[token]
  }
  return overrides
}

export function deriveThemeColors(source: ThemeColorSource): ThemeColors {
  const colors = {} as ThemeColors
  for (const token of THEME_COLOR_TOKENS) {
    colors[token] = THEME_COLOR_DERIVATIONS[token](source)
  }
  return colors
}

export const COLOR_THEMES: Record<ColorTheme, ColorThemeConfig> = {
  default: { label: 'Default' },
  paper: {
    label: 'Paper',
    ...deriveThemeColors({ background: '#fcfaf8' })
  },
  sand: {
    label: 'Sand',
    ...deriveThemeColors({ background: '#f5f0e8' })
  },
  rose: {
    label: 'Rose',
    ...deriveThemeColors({ background: '#fef6f8' })
  },
  lavender: {
    label: 'Lavender',
    ...deriveThemeColors({ background: '#f8f7fd' })
  },
  mint: {
    label: 'Mint',
    ...deriveThemeColors({ background: '#f7fcfa' })
  },
  sky: {
    label: 'Sky',
    ...deriveThemeColors({ background: '#f6fafd' })
  }
}
