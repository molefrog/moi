import { useEffect } from 'react'
import type { CSSProperties } from 'react'

import {
  COLOR_THEMES,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_WORKSPACE_THEME,
  FONT_THEMES,
  RADIUS_THEMES,
  THEME_COLOR_TOKENS,
  deriveThemeColors,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { ThemeColorMode, ThemeColorToken } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

const FONT_LINK_ID = 'moi-fonts'
const FONT_PREVIEW_LINK_ID = 'moi-font-previews'
const ALL_FONTS_QUERY = Object.values(FONT_THEMES)
  .map(theme => theme.googleFontsQuery)
  .filter(Boolean)
  .join('&family=')
const WORKSPACE_FONT_PROPERTIES = [
  ['sans', '--sans'],
  ['mono', '--mono']
] as const
const WORKSPACE_COLOR_PROPERTIES = THEME_COLOR_TOKENS.map(
  token => [token, themeColorProperty(token)] as const
)
const WORKSPACE_RADIUS_PROPERTY = '--radius' as const
const WORKSPACE_THEME_PROPERTIES = [
  ...WORKSPACE_FONT_PROPERTIES.map(([, property]) => property),
  ...WORKSPACE_COLOR_PROPERTIES.map(([, property]) => property),
  WORKSPACE_RADIUS_PROPERTY
]

type WorkspaceThemeStyle = CSSProperties & {
  [property: `--${string}`]: string | undefined
}

function themeColorProperty(token: ThemeColorToken): `--${string}` {
  const name = token.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return `--${name}`
}

export function getWorkspaceThemeFontStyle(theme: WorkspaceLayout['theme']): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const resolved = resolveWorkspaceTheme(theme)

  const font =
    resolved.font === DEFAULT_WORKSPACE_THEME.font ? undefined : FONT_THEMES[resolved.font]

  for (const [token, property] of WORKSPACE_FONT_PROPERTIES) {
    style[property] = font?.[token]
  }
  return style
}

export function getWorkspaceThemeColorStyle(
  theme: WorkspaceLayout['theme'],
  colorMode: ThemeColorMode = 'workspace'
): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const resolved = resolveWorkspaceTheme(theme)

  const color = COLOR_THEMES[resolved.color] ?? COLOR_THEMES[DEFAULT_WORKSPACE_THEME.color]
  const primary = color.primary ?? (colorMode === 'widget' ? DEFAULT_PRIMARY_COLOR : undefined)
  const colors = primary ? deriveThemeColors(primary, colorMode) : undefined

  for (const [token, property] of WORKSPACE_COLOR_PROPERTIES) {
    style[property] = colors?.[token]
  }
  return style
}

export function getWorkspaceThemeRadiusStyle(theme: WorkspaceLayout['theme']): WorkspaceThemeStyle {
  const style: WorkspaceThemeStyle = {}
  const resolved = resolveWorkspaceTheme(theme)

  const radius =
    resolved.radius === DEFAULT_WORKSPACE_THEME.radius ? undefined : RADIUS_THEMES[resolved.radius]

  style[WORKSPACE_RADIUS_PROPERTY] = radius?.radius
  return style
}

export function getWorkspaceThemeStyle(
  theme: WorkspaceLayout['theme'],
  colorMode: ThemeColorMode = 'workspace'
): WorkspaceThemeStyle {
  return {
    ...getWorkspaceThemeFontStyle(theme),
    ...getWorkspaceThemeColorStyle(theme, colorMode),
    ...getWorkspaceThemeRadiusStyle(theme)
  }
}

export function usePreloadWorkspaceFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_PREVIEW_LINK_ID)) return

    const link = document.createElement('link')
    link.id = FONT_PREVIEW_LINK_ID
    link.rel = 'stylesheet'
    // CORS mode makes the sheet's cssRules readable, so thumbnail capture
    // (modern-screenshot) can inline the @font-face rules into its SVG —
    // an SVG rasterized in <img> can't use the page's webfonts otherwise.
    link.crossOrigin = 'anonymous'
    link.href = `https://fonts.googleapis.com/css2?family=${ALL_FONTS_QUERY}&display=swap`
    document.head.appendChild(link)

    return () => {
      link.remove()
    }
  }, [])
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
  const { font } = resolveWorkspaceTheme(theme)
  useDocumentWorkspaceThemeStyle(theme)

  useEffect(() => {
    const config = FONT_THEMES[font] ?? FONT_THEMES[DEFAULT_WORKSPACE_THEME.font]

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
        // Same CORS requirement as the preview link above: thumbnail capture
        // can only embed @font-face rules from origin-clean stylesheets.
        link.crossOrigin = 'anonymous'
        link.href = url
        document.head.appendChild(link)
      }
    }

    return () => {
      document.getElementById(FONT_LINK_ID)?.remove()
    }
  }, [font])
}
