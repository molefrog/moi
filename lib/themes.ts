export type FontTheme = 'default' | 'serif' | 'mono' | 'bubbly' | 'geometric' | 'retro'

export type FontThemeConfig = {
  label: string
  sans: string
  mono: string
  feel: string
  googleFontsQuery?: string // passed as `family=` param to Google Fonts API
}

export const FONT_THEMES: Record<FontTheme, FontThemeConfig> = {
  default: {
    label: 'Default',
    sans: 'system-ui',
    mono: 'JetBrains Mono',
    feel: 'Native OS, zero load',
    googleFontsQuery: 'JetBrains+Mono:wght@400;500'
  },
  serif: {
    label: 'Serif',
    sans: 'Libre Baskerville',
    mono: 'JetBrains Mono',
    feel: 'Classic serif, literary',
    googleFontsQuery: 'Libre+Baskerville:wght@400;700&family=JetBrains+Mono:wght@400;500'
  },
  mono: {
    label: 'Mono',
    sans: 'JetBrains Mono',
    mono: 'JetBrains Mono',
    feel: 'Full terminal, hacker',
    googleFontsQuery: 'JetBrains+Mono:wght@400;500;600'
  },
  bubbly: {
    label: 'Bubbly',
    sans: 'Fredoka',
    mono: 'Azeret Mono',
    feel: 'Very round, toy-like',
    googleFontsQuery: 'Fredoka:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  geometric: {
    label: 'Geometric',
    sans: 'Outfit',
    mono: 'DM Mono',
    feel: 'Swiss design, neutral',
    googleFontsQuery: 'Outfit:wght@400;500;600&family=DM+Mono:wght@400;500'
  },
  retro: {
    label: 'Retro',
    sans: 'Courier Prime',
    mono: 'Courier Prime',
    feel: 'Typewriter nostalgia',
    googleFontsQuery: 'Courier+Prime:wght@400;700'
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
