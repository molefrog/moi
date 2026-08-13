import type { CSSProperties, ReactNode, Ref } from 'react'

import { IconCircleCheckFilled } from '@tabler/icons-react'

import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { BottomPanel } from '@/client/components/shared/BottomPanel'
import { cn } from '@/client/lib/cn'
import { getWorkspaceThemeStyle, usePreloadWorkspaceFonts } from '@/client/runtime/workspace-theme'
import {
  COLOR_THEMES,
  type ColorThemeConfig,
  FONT_THEMES,
  RADIUS_THEMES,
  type RadiusThemeConfig,
  resolveWorkspaceTheme
} from '@/lib/themes'
import type { ColorTheme, FontTheme, RadiusTheme, WorkspaceTheme } from '@/lib/types'

const FONT_OPTIONS = Object.entries(FONT_THEMES) as [FontTheme, (typeof FONT_THEMES)[FontTheme]][]

const COLOR_OPTIONS = Object.entries(COLOR_THEMES) as [ColorTheme, ColorThemeConfig][]

const RADIUS_OPTIONS = Object.entries(RADIUS_THEMES) as [RadiusTheme, RadiusThemeConfig][]

type CustomizeOptionGroupProps = {
  children: ReactNode
  className?: string
  gridClassName?: string
  label: string
}

function CustomizeOptionGroup({
  children,
  className,
  gridClassName,
  label
}: CustomizeOptionGroupProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <p className="text-xs font-medium">{label}</p>
      <div
        role="group"
        aria-label={label}
        className={cn('grid grid-cols-4 gap-2 @4xl/workspace:grid-cols-2', gridClassName)}
      >
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
      <div className="flex flex-1 flex-col justify-center">{children}</div>
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
  const theme = resolveWorkspaceTheme(layout.theme)

  function setTheme(update: Partial<WorkspaceTheme>) {
    setLayout({ theme: { ...theme, ...update } })
  }

  return (
    <BottomPanel
      ref={ref}
      title="Customize"
      onClose={onClose}
      className="@4xl/workspace:max-w-4xl"
    >
      <div className="grid grid-cols-1 gap-4 @4xl/workspace:grid-cols-[repeat(2,minmax(0,1fr))_0.5rem_repeat(2,minmax(0,1fr))_0.5rem_minmax(0,1fr)] @4xl/workspace:gap-x-2">
        <CustomizeOptionGroup
          label="Font"
          className="@4xl/workspace:col-start-1 @4xl/workspace:col-span-2"
        >
          {FONT_OPTIONS.map(([key, config]) => (
            <CustomizeOption
              key={key}
              active={key === theme.font}
              onSelect={() => setTheme({ font: key })}
              style={{ fontFamily: config.sans }}
            >
              <span className="text-sm font-medium">{config.label}</span>
            </CustomizeOption>
          ))}
        </CustomizeOptionGroup>

        <CustomizeOptionGroup
          label="Colors"
          className="@4xl/workspace:col-start-4 @4xl/workspace:col-span-2"
        >
          {COLOR_OPTIONS.map(([key, preset]) => (
            <CustomizeOption
              key={key}
              active={key === theme.color}
              className={preset.primary && 'bg-background text-foreground'}
              onSelect={() => setTheme({ color: key })}
              style={getWorkspaceThemeStyle({ ...theme, color: key })}
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

        <CustomizeOptionGroup
          label="Radius"
          className="@4xl/workspace:col-start-7"
          gridClassName="@4xl/workspace:grid-cols-1"
        >
          {RADIUS_OPTIONS.map(([key, preset]) => (
            <CustomizeOption
              key={key}
              active={key === theme.radius}
              onSelect={() => setTheme({ radius: key })}
              style={getWorkspaceThemeStyle({ ...theme, radius: key })}
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-5 shrink-0 rounded-sm bg-card texture-checker-2.5 shadow-xs"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">{preset.label}</span>
              </div>
            </CustomizeOption>
          ))}
        </CustomizeOptionGroup>
      </div>
    </BottomPanel>
  )
}
