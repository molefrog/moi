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
    feel: 'PT Serif',
    sans: 'PT Serif',
    mono: 'JetBrains Mono',
    googleFontsQuery: 'PT+Serif:wght@400;600;700&family=JetBrains+Mono:wght@400;500'
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

export type ColorThemeConfig = {
  label: string
  // undefined background/foreground = no override, reveals :root defaults
  background?: string
  foreground?: string
  feel: string
}

export const COLOR_THEMES: Record<ColorTheme, ColorThemeConfig> = {
  default: { label: 'Default', feel: 'System neutral' },
  paper: {
    label: 'Paper',
    background: '#faf8f5',
    foreground: '#2c2825',
    feel: 'Warm off-white'
  },
  sand: {
    label: 'Sand',
    background: '#f5f0e8',
    foreground: '#3d3529',
    feel: 'Beige earth tones'
  },
  rose: { label: 'Rose', background: '#fdf2f4', foreground: '#3b1c26', feel: 'Soft blush' },
  lavender: {
    label: 'Lavender',
    background: '#f4f2fb',
    foreground: '#2b2640',
    feel: 'Cool violet'
  },
  mint: { label: 'Mint', background: '#f0faf6', foreground: '#1a3028', feel: 'Cool green' },
  sky: { label: 'Sky', background: '#f0f6fc', foreground: '#1a2a3b', feel: 'Cool blue' }
}
