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
