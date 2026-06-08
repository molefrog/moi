import { type RefObject, useEffect } from 'react'

import { FONT_THEMES } from '@/lib/themes'
import type { WorkspaceLayout } from '@/lib/types'

const COLOR_OVERRIDES = ['background', 'foreground'] as const
const FONT_LINK_ID = 'mei-fonts'

// Applies the workspace theme (font + color overrides) to a target element —
// the workspace panel, NOT :root — so the sidebar and other pages keep the
// default tokens. CSS custom properties inherit and every Tailwind token is a
// `var(--…)` reference, so `bg-background` / `text-foreground` / `font-sans`
// inside the subtree resolve the scoped values (the element re-declares
// `font-family: var(--font-sans)` via the `font-sans` class so the font
// re-resolves locally rather than inheriting the already-resolved root font).
//
// Everything is torn down on unmount: the inline vars are removed (the element
// usually unmounts with the page anyway) and the injected Google Fonts <link>
// is dropped, so leaving the workspace leaves no global residue.
export function useWorkspaceTheme(
  theme: WorkspaceLayout['theme'],
  target: RefObject<HTMLElement | null>
) {
  const font = theme?.font ?? 'default'

  useEffect(() => {
    const el = target.current
    if (!el) return
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
  }, [font, target])

  useEffect(() => {
    const el = target.current
    if (!el) return
    for (const key of COLOR_OVERRIDES) {
      const value = theme?.[key]
      if (value) {
        el.style.setProperty(`--${key}`, value)
      } else {
        el.style.removeProperty(`--${key}`)
      }
    }
    return () => {
      for (const key of COLOR_OVERRIDES) el.style.removeProperty(`--${key}`)
    }
  }, [theme?.background, theme?.foreground, target])

  // Drop the shared font <link> when the workspace unmounts.
  useEffect(() => () => document.getElementById(FONT_LINK_ID)?.remove(), [])
}
