import { useEffect } from 'react'

import { cn } from '@/client/lib/cn'
import { useWorkspaceStore } from '@/client/store/workspace'
import { FONT_THEMES } from '@/lib/themes'
import type { FontTheme } from '@/lib/types'

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

type ColorPreset = {
  label: string
  background?: string
  foreground?: string
}

const COLOR_PRESETS: ColorPreset[] = [
  { label: 'Default' },
  { label: 'Paper', background: '#faf8f5', foreground: '#2c2825' },
  { label: 'Sand', background: '#f5f0e8', foreground: '#3d3529' },
  { label: 'Rose', background: '#fdf2f4', foreground: '#3b1c26' },
  { label: 'Lavender', background: '#f4f2fb', foreground: '#2b2640' },
  { label: 'Mint', background: '#f0faf6', foreground: '#1a3028' },
  { label: 'Sky', background: '#f0f6fc', foreground: '#1a2a3b' }
]

function presetMatches(preset: ColorPreset, bg?: string, fg?: string): boolean {
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
            {COLOR_PRESETS.map(preset => {
              const active = presetMatches(preset, currentBg, currentFg)
              return (
                <button
                  key={preset.label}
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
