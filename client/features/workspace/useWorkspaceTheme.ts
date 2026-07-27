import { useEffect } from 'react'

import { FONT_THEMES } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

const COLOR_OVERRIDES = ['background', 'foreground', 'muted'] as const
const FONT_LINK_ID = 'mei-fonts'

// Applies the active workspace theme to the app root so the workspace, sidebar,
// and body-level portals all resolve the same Tailwind tokens.
//
// Everything is torn down on unmount: the root vars and injected Google Fonts
// <link> are removed, so pages outside a workspace return to the app defaults.
export function useWorkspaceTheme(theme: WorkspaceLayout['theme']) {
  const font = theme?.font ?? 'default'
  // Read the color overrides up front so the color effect below depends on
  // these exact values rather than the whole `theme` object.
  const background = theme?.background
  const foreground = theme?.foreground

  useEffect(() => {
    const el = document.documentElement
    const config = FONT_THEMES[font] ?? FONT_THEMES.default

    el.style.setProperty('--font-sans', config.sans)
    el.style.setProperty('--font-mono', config.mono)

    // Ensure the font files are available (the <link> is global; applying the
    // font is what's scoped, via the vars above).
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
      el.style.removeProperty('--font-sans')
      el.style.removeProperty('--font-mono')
    }
  }, [font])

  useEffect(() => {
    const el = document.documentElement
    const overrides = {
      background,
      foreground,
      muted: background
        ? 'color-mix(in oklch, var(--background) 5%, var(--foreground) 5%)'
        : undefined
    }
    for (const key of COLOR_OVERRIDES) {
      const value = overrides[key]
      if (value) {
        el.style.setProperty(`--${key}`, value)
      } else {
        el.style.removeProperty(`--${key}`)
      }
    }
    return () => {
      for (const key of COLOR_OVERRIDES) el.style.removeProperty(`--${key}`)
    }
  }, [background, foreground])

  // Drop the shared font <link> when the workspace unmounts.
  useEffect(() => () => document.getElementById(FONT_LINK_ID)?.remove(), [])
}
