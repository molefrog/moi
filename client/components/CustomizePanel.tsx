import { useEffect } from 'react'

import { cn } from '@/client/lib/cn'
import { useWorkspaceStore } from '@/client/store/workspace'
import { COLOR_THEMES, type ColorThemeConfig, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme } from '@/lib/types'

import { BottomPanel } from './BottomPanel'

const ALL_FONT_PREVIEW_ID = 'mei-font-previews'
const ALL_FONTS_QUERY = Object.values(FONT_THEMES)
  .map(f => f.googleFontsQuery)
  .filter(Boolean)
  .join('&family=')

function usePreloadAllFonts() {
  useEffect(() => {
    if (document.getElementById(ALL_FONT_PREVIEW_ID)) return
    const link = document.createElement('link')
    link.id = ALL_FONT_PREVIEW_ID
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${ALL_FONTS_QUERY}&display=swap`
    document.head.appendChild(link)
  }, [])
}

const FONT_OPTIONS = Object.entries(FONT_THEMES) as [FontTheme, (typeof FONT_THEMES)[FontTheme]][]

const COLOR_OPTIONS = Object.entries(COLOR_THEMES) as [ColorTheme, ColorThemeConfig][]

function presetMatches(preset: ColorThemeConfig, bg?: string, fg?: string): boolean {
  return (preset.background ?? undefined) === bg && (preset.foreground ?? undefined) === fg
}

export function CustomizePanel() {
  usePreloadAllFonts()
  const { layout, setLayout } = useWorkspaceStore()
  const currentFont = layout.theme?.font ?? 'default'
  const currentBg = layout.theme?.background
  const currentFg = layout.theme?.foreground

  function setTheme(update: Partial<NonNullable<typeof layout.theme>>) {
    setLayout({ theme: { ...layout.theme, font: currentFont, ...update } })
  }

  return (
    <BottomPanel title="Customize">
      <div className="flex flex-col gap-6">
        {/* Font picker */}
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium">Font</p>
          <div className="grid grid-cols-3 gap-2">
            {FONT_OPTIONS.map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTheme({ font: key })}
                className={cn(
                  'flex flex-col items-start rounded-md px-3 py-2 text-left transition-colors',
                  key === currentFont
                    ? 'ring-primary bg-primary/5 ring-2'
                    : 'hover:bg-muted border-transparent'
                )}
                style={{ fontFamily: config.sans }}
              >
                <span className="text-sm font-medium">{config.label}</span>
                <span className="text-muted-foreground text-xs">{config.feel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Color palette */}
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium">Colors</p>
          <div className="grid grid-cols-3 gap-2">
            {COLOR_OPTIONS.map(([key, preset]) => {
              const active = presetMatches(preset, currentBg, currentFg)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setTheme({ background: preset.background, foreground: preset.foreground })
                  }
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                    active
                      ? 'ring-primary bg-primary/5 ring-2'
                      : 'hover:bg-muted border-transparent'
                  )}
                >
                  <span
                    className="size-5 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.background ?? 'oklch(1 0 0)' }}
                  >
                    <span
                      className="flex size-full items-center justify-center text-[9px] font-bold leading-none"
                      style={{ color: preset.foreground ?? 'oklch(0.145 0 0)' }}
                    >
                      A
                    </span>
                  </span>
                  <span className="text-sm">{preset.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </BottomPanel>
  )
}
