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

export type ColorTheme = 'default' | 'paper' | 'sand' | 'rose' | 'lavender' | 'mint' | 'sky'

function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error(`Primary theme color must use #rrggbb: ${hex}`)
  }

  const channels = [1, 3, 5].map(index => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function foregroundForPrimary(primary: string): string {
  return relativeLuminance(primary) > 0.24 ? '#000000' : '#ffffff'
}

const THEME_COLOR_DERIVATIONS = {
  primary: primary => primary,
  primaryForeground: primary => foregroundForPrimary(primary),
  background: () => 'color-mix(in oklch, var(--primary) 3%, white 97%)',
  foreground: () => 'color-mix(in oklch, var(--primary) 24%, black 76%)',
  muted: () => 'color-mix(in oklch, var(--background) 95%, var(--foreground) 5%)',
  mutedForeground: () => 'color-mix(in oklch, var(--background) 58%, var(--foreground) 42%)',
  accent: () => 'color-mix(in oklch, var(--primary) 5%, var(--foreground) 5%)'
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
    primary: '#453521'
  },
  sand: {
    label: 'Sand',
    primary: '#ff8700'
  },
  rose: {
    label: 'Rose',
    primary: '#f13c3c'
  },
  lavender: {
    label: 'Lavender',
    primary: '#9051ff'
  },
  mint: {
    label: 'Tropics',
    primary: '#00914a'
  },
  sky: {
    label: 'Sky',
    primary: '#007ae3'
  }
}
