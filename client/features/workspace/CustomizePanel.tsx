import type { CSSProperties, ReactNode, Ref } from 'react'

import { IconCircleCheckFilled } from '@tabler/icons-react'

import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { BottomPanel } from '@/client/components/shared/BottomPanel'
import { cn } from '@/client/lib/cn'
import { getWorkspaceThemeStyle, usePreloadWorkspaceFonts } from '@/client/runtime/workspace-theme'
import { COLOR_THEMES, type ColorThemeConfig, FONT_THEMES } from '@/lib/themes'
import type { ColorTheme, FontTheme } from '@/lib/types'

const FONT_OPTIONS = Object.entries(FONT_THEMES) as [FontTheme, (typeof FONT_THEMES)[FontTheme]][]

const COLOR_OPTIONS = Object.entries(COLOR_THEMES) as [ColorTheme, ColorThemeConfig][]

function presetMatches(preset: ColorThemeConfig, primary?: string): boolean {
  return (preset.primary ?? undefined) === primary
}

type CustomizeOptionGroupProps = {
  children: ReactNode
  label: string
}

function CustomizeOptionGroup({ children, label }: CustomizeOptionGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium">{label}</p>
      <div role="group" aria-label={label} className="grid grid-cols-3 gap-2">
        {children}
      </div>
    </div>
  )
}

type CustomizeOptionProps = {
  active: boolean
  children: ReactNode
  className?: string
  onSelect: () => void
  style?: CSSProperties
}

function CustomizeOption({ active, children, className, onSelect, style }: CustomizeOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'relative w-full rounded-lg bg-card text-left ring-1 ring-border transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        'flex items-center gap-2 p-3',
        className,
        !active && 'cursor-pointer pr-9 opacity-70 hover:opacity-100'
      )}
      style={style}
    >
      <div className="flex-1">{children}</div>
      {active && <IconCircleCheckFilled size={20} stroke={1.5} aria-hidden="true" />}
    </button>
  )
}

type CustomizePanelProps = {
  onClose: () => void
  ref?: Ref<HTMLDivElement>
}

export function CustomizePanel({ onClose, ref }: CustomizePanelProps) {
  usePreloadWorkspaceFonts()
  const { layout, setLayout } = useWorkspaceLayoutCtx()
  const currentFont = layout.theme?.font ?? 'default'
  const currentPrimary = layout.theme?.primary

  function setTheme(font: FontTheme, primary: string | undefined) {
    setLayout({ theme: { font, ...(primary ? { primary } : {}) } })
  }

  return (
    <BottomPanel ref={ref} title="Customize" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <CustomizeOptionGroup label="Font">
          {FONT_OPTIONS.map(([key, config]) => (
            <CustomizeOption
              key={key}
              active={key === currentFont}
              onSelect={() => setTheme(key, currentPrimary)}
              style={{ fontFamily: config.sans }}
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
              active={presetMatches(preset, currentPrimary)}
              className={preset.primary && 'bg-background text-foreground'}
              onSelect={() => setTheme(currentFont, preset.primary)}
              style={
                preset.primary
                  ? getWorkspaceThemeStyle({ font: currentFont, primary: preset.primary })
                  : undefined
              }
            >
              <div className="flex gap-2">
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-sm text-[9px] leading-none font-bold',
                    preset.primary
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground text-background'
                  )}
                >
                  Aa
                </span>
                <span className="text-sm font-medium">{preset.label}</span>
              </div>
            </CustomizeOption>
          ))}
        </CustomizeOptionGroup>
      </div>
    </BottomPanel>
  )
}
