import { useEffect } from 'react'
import type { CSSProperties } from 'react'

import { FONT_THEMES, THEME_COLOR_TOKENS } from '@/lib/themes'
import type { ThemeColorOverrides, ThemeColorToken } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

const FONT_LINK_ID = 'mei-fonts'
const WORKSPACE_COLOR_PROPERTIES = THEME_COLOR_TOKENS.map(
  token => [token, themeColorProperty(token)] as const
)

type WorkspaceThemeStyle = CSSProperties & {
  [property: `--${string}`]: string | undefined
}

function themeColorProperty(token: ThemeColorToken): `--${string}` {
  const name = token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return `--${name}`
}

export function getWorkspaceThemeStyle(
  theme: ThemeColorOverrides | undefined
): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  for (const [token, property] of WORKSPACE_COLOR_PROPERTIES) {
    style[property] = theme?.[token]
  }
  return style
}

function useDocumentWorkspaceThemeStyle(theme: ThemeColorOverrides | undefined) {
  useEffect(() => {
    const element = document.documentElement
    const style = getWorkspaceThemeStyle(theme)

    for (const [, property] of WORKSPACE_COLOR_PROPERTIES) {
      const value = style[property]
      if (value) {
        element.style.setProperty(property, value)
      } else {
        element.style.removeProperty(property)
      }
    }

    return () => {
      for (const [, property] of WORKSPACE_COLOR_PROPERTIES) {
        element.style.removeProperty(property)
      }
    }
  }, [theme])
}

// Applies the active workspace theme to the document root so the workspace,
// sidebar, and body-level portals all resolve the same tokens.
export function useWorkspaceTheme(theme: WorkspaceLayout['theme']) {
  const font = theme?.font ?? 'default'
  useDocumentWorkspaceThemeStyle(theme)

  useEffect(() => {
    const element = document.documentElement
    const config = FONT_THEMES[font] ?? FONT_THEMES.default

    element.style.setProperty('--font-sans', config.sans)
    element.style.setProperty('--font-mono', config.mono)

    const existing = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null
    if (!config.googleFontsQuery) {
      existing?.remove()
    } else {
      const url = `https://fonts.googleapis.com/css2?family=${config.googleFontsQuery}&display=swap`
      if (existing) {
        existing.href = url
      } else {
        const link = document.createElement('link')
        link.id = FONT_LINK_ID
        link.rel = 'stylesheet'
        link.href = url
        document.head.appendChild(link)
      }
    }

    return () => {
      element.style.removeProperty('--font-sans')
      element.style.removeProperty('--font-mono')
      document.getElementById(FONT_LINK_ID)?.remove()
    }
  }, [font])
}
