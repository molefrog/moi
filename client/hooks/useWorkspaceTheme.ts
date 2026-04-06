import { useEffect } from 'react'

import { useWorkspaceStore } from '@/client/store/workspace'
import { FONT_THEMES } from '@/lib/themes'

export function useWorkspaceTheme() {
  const font = useWorkspaceStore(s => s.layout.theme?.font ?? 'system')

  useEffect(() => {
    const config = FONT_THEMES[font] ?? FONT_THEMES.system

    document.documentElement.style.setProperty('--font-sans', config.sans)
    document.documentElement.style.setProperty('--font-mono', config.mono)

    // Inject or update the Google Fonts <link> tag
    const existing = document.getElementById('mei-fonts')
    if (!config.googleFontsQuery) {
      existing?.remove()
      return
    }

    const url = `https://fonts.googleapis.com/css2?family=${config.googleFontsQuery}&display=swap`
    if (existing) {
      ;(existing as HTMLLinkElement).href = url
    } else {
      const link = document.createElement('link')
      link.id = 'mei-fonts'
      link.rel = 'stylesheet'
      link.href = url
      document.head.appendChild(link)
    }
  }, [font])
}
