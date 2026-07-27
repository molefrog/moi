import { useEffect } from 'react'
import type { CSSProperties } from 'react'

import { FONT_THEMES, THEME_COLOR_TOKENS } from '@/lib/themes'
import type { ThemeColorToken } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

const FONT_LINK_ID = 'mei-fonts'
const WORKSPACE_FONT_PROPERTIES = [
  ['sans', '--sans'],
  ['mono', '--mono']
] as const
const WORKSPACE_COLOR_PROPERTIES = THEME_COLOR_TOKENS.map(
  token => [token, themeColorProperty(token)] as const
)
const WORKSPACE_THEME_PROPERTIES = [
  ...WORKSPACE_FONT_PROPERTIES.map(([, property]) => property),
  ...WORKSPACE_COLOR_PROPERTIES.map(([, property]) => property)
]

type WorkspaceThemeStyle = CSSProperties & {
  [property: `--${string}`]: string | undefined
}

function themeColorProperty(token: ThemeColorToken): `--${string}` {
  const name = token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return `--${name}`
}

export function getWorkspaceThemeStyle(theme: WorkspaceLayout['theme']): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const font = FONT_THEMES[theme?.font ?? 'default'] ?? FONT_THEMES.default
  for (const [token, property] of WORKSPACE_FONT_PROPERTIES) {
    style[property] = font[token]
  }
  for (const [token, property] of WORKSPACE_COLOR_PROPERTIES) {
    style[property] = theme?.[token]
  }
  return style
}

function useDocumentWorkspaceThemeStyle(theme: WorkspaceLayout['theme']) {
  useEffect(() => {
    const element = document.documentElement
    const style = getWorkspaceThemeStyle(theme)

    for (const property of WORKSPACE_THEME_PROPERTIES) {
      const value = style[property]
      if (value) {
        element.style.setProperty(property, value)
      } else {
        element.style.removeProperty(property)
      }
    }

    return () => {
      for (const property of WORKSPACE_THEME_PROPERTIES) {
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
    const config = FONT_THEMES[font] ?? FONT_THEMES.default

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
      document.getElementById(FONT_LINK_ID)?.remove()
    }
  }, [font])
}
