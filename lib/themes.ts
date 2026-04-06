export type FontTheme =
  | 'system'
  | 'neue'
  | 'mono'
  | 'bubbly'
  | 'editorial'
  | 'geometric'
  | 'readable'
  | 'retro'

export type FontThemeConfig = {
  label: string
  sans: string
  mono: string
  feel: string
  googleFontsQuery?: string // passed as `family=` param to Google Fonts API
}

export const FONT_THEMES: Record<FontTheme, FontThemeConfig> = {
  system: {
    label: 'System',
    sans: 'system-ui',
    mono: 'JetBrains Mono',
    feel: 'Native OS, zero load',
    googleFontsQuery: 'JetBrains+Mono:wght@400;500'
  },
  neue: {
    label: 'Neue',
    sans: 'Inter',
    mono: 'Geist Mono',
    feel: 'Clean modern SaaS',
    googleFontsQuery: 'Inter:wght@400;500;600&family=Geist+Mono:wght@400;500'
  },
  mono: {
    label: 'Mono',
    sans: 'IBM Plex Mono',
    mono: 'IBM Plex Mono',
    feel: 'Full terminal, hacker',
    googleFontsQuery: 'IBM+Plex+Mono:wght@400;500;600'
  },
  bubbly: {
    label: 'Bubbly',
    sans: 'Fredoka',
    mono: 'Azeret Mono',
    feel: 'Very round, toy-like',
    googleFontsQuery: 'Fredoka:wght@400;500;600&family=Azeret+Mono:wght@400;500'
  },
  editorial: {
    label: 'Editorial',
    sans: 'Playfair Display',
    mono: 'Source Code Pro',
    feel: 'Magazine, elegant',
    googleFontsQuery: 'Playfair+Display:wght@400;500;600&family=Source+Code+Pro:wght@400;500'
  },
  geometric: {
    label: 'Geometric',
    sans: 'Outfit',
    mono: 'DM Mono',
    feel: 'Swiss design, neutral',
    googleFontsQuery: 'Outfit:wght@400;500;600&family=DM+Mono:wght@400;500'
  },
  readable: {
    label: 'Readable',
    sans: 'Atkinson Hyperlegible',
    mono: 'Fira Code',
    feel: 'Accessibility-first',
    googleFontsQuery: 'Atkinson+Hyperlegible:wght@400;700&family=Fira+Code:wght@400;500'
  },
  retro: {
    label: 'Retro',
    sans: 'Courier Prime',
    mono: 'Courier Prime',
    feel: 'Typewriter nostalgia',
    googleFontsQuery: 'Courier+Prime:wght@400;700'
  }
}
