import { type ReactNode, type Ref, useEffect } from 'react'

import { IconCircleCheckFilled } from '@tabler/icons-react'

import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { BottomPanel } from '@/client/components/shared/BottomPanel'
import { cn } from '@/client/lib/cn'
import {
  COLOR_THEMES,
  type ColorThemeConfig,
  FONT_THEMES,
  getThemeColorOverrides
} from '@/lib/themes'
import type { ColorTheme, FontTheme } from '@/lib/types'

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

type CustomizeOptionGroupProps = {
  children: ReactNode
  label: string
}

function CustomizeOptionGroup({ children, label }: CustomizeOptionGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
        {children}
      </div>
    </div>
  )
}

type CustomizeOptionProps = {
  active: boolean
  children: ReactNode
  fontFamily?: string
  onSelect: () => void
}

function CustomizeOption({ active, children, fontFamily, onSelect }: CustomizeOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'relative w-full rounded-md bg-card text-left ring-1 ring-border transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        'flex items-center gap-2 p-3',
        !active && 'cursor-pointer pr-9 opacity-70 hover:opacity-100'
      )}
      style={fontFamily ? { fontFamily } : undefined}
    >
      <div className="flex-1">{children}</div>
      {active && <IconCircleCheckFilled size={20} stroke={1.5} aria-hidden="true" />}
    </button>
  )
}

type CustomizePanelProps = {
  ref?: Ref<HTMLDivElement>
}

export function CustomizePanel({ ref }: CustomizePanelProps) {
  usePreloadAllFonts()
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const currentFont = layout.theme?.font ?? 'default'
  const currentBg = layout.theme?.background
  const currentFg = layout.theme?.foreground

  function setTheme(update: Partial<NonNullable<typeof layout.theme>>) {
    setLayout({ theme: { ...layout.theme, font: currentFont, ...update } })
  }

  return (
    <BottomPanel ref={ref} title="Customize">
      <div className="flex flex-col gap-6">
        <CustomizeOptionGroup label="Font">
          {FONT_OPTIONS.map(([key, config]) => (
            <CustomizeOption
              key={key}
              active={key === currentFont}
              fontFamily={config.sans}
              onSelect={() => setTheme({ font: key })}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{config.label}</span>
                <span className="text-xs text-muted-foreground">{config.feel}</span>
              </div>
            </CustomizeOption>
          ))}
        </CustomizeOptionGroup>

        <CustomizeOptionGroup label="Colors">
          {COLOR_OPTIONS.map(([key, preset]) => (
            <CustomizeOption
              key={key}
              active={presetMatches(preset, currentBg, currentFg)}
              onSelect={() => setTheme(getThemeColorOverrides(preset))}
            >
              <div className="flex gap-2">
                <span
                  className="size-5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: preset.background ?? 'oklch(1 0 0)' }}
                >
                  <span
                    className="flex size-full items-center justify-center text-[9px] leading-none font-bold"
                    style={{ color: preset.foreground ?? 'oklch(0.145 0 0)' }}
                  >
                    A
                  </span>
                </span>
                <span className="text-sm">{preset.label}</span>
              </div>
            </CustomizeOption>
          ))}
        </CustomizeOptionGroup>
      </div>
    </BottomPanel>
  )
}
