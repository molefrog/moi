import { createElement } from 'react'

import claudeIcon from '@/client/assets/claude.svg'
import hermesIcon from '@/client/assets/hermes.png'
import openaiIcon from '@/client/assets/openai.svg'
import openclawIcon from '@/client/assets/openclaw.svg'
import { resolveAppIcon } from '@/client/lib/app-icon-registry'
import { cn } from '@/client/lib/cn'
import { DEFAULT_PRIMARY_COLOR, deriveThemeColors, resolveThemeColorOverrides } from '@/lib/themes'
import type {
  WorkspaceIcon as WorkspaceIconValue,
  WorkspaceLayout,
  WorkspaceType
} from '@/lib/types'

export const workspaceProviderIcon: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  codex: openaiIcon,
  hermes: hermesIcon
}

type WorkspaceIconProps = {
  className?: string
  icon?: WorkspaceIconValue
  workspaceType?: WorkspaceType | null
  workspaceTheme?: WorkspaceLayout['theme']
}

export function WorkspaceIcon({
  className,
  icon,
  workspaceType,
  workspaceTheme
}: WorkspaceIconProps) {
  const themed = icon?.type !== 'upload' && icon?.background === 'theme'
  const Glyph = icon?.type === 'glyph' ? resolveAppIcon(icon.value) : null
  const colors = themed
    ? (resolveThemeColorOverrides(workspaceTheme) ?? deriveThemeColors(DEFAULT_PRIMARY_COLOR))
    : undefined

  return (
    <span
      className={cn(
        '[container-type:inline-size] inline-flex shrink-0 items-center justify-center overflow-hidden',
        themed && 'shadow-[inset_0_0_1rem_rgba(255,255,255,0.3)]',
        className
      )}
      style={
        colors ? { backgroundColor: colors.primary, color: colors.primaryForeground } : undefined
      }
    >
      {Glyph ? (
        createElement(Glyph, {
          'aria-hidden': true,
          stroke: 1.75,
          className: cn(themed ? 'size-[70%]' : 'size-[95%] text-foreground')
        })
      ) : icon?.type === 'emoji' ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-full translate-y-[2cqi] items-center justify-center font-[Apple_Color_Emoji,Segoe_UI_Emoji,Noto_Color_Emoji,sans-serif] leading-none',
            themed ? 'text-[60cqi]' : 'text-[85cqi]'
          )}
        >
          {icon.value}
        </span>
      ) : (
        <img
          src={
            icon?.type === 'upload'
              ? icon.value
              : workspaceProviderIcon[workspaceType ?? 'claude-code']
          }
          alt=""
          className="size-full"
        />
      )}
    </span>
  )
}
