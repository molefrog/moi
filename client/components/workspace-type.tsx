import claudeIcon from '@/client/assets/claude.svg'
import hermesIcon from '@/client/assets/hermes-nous.png'
import openclawIcon from '@/client/assets/openclaw.svg'
import { cn } from '@/client/lib/cn'
import type { WorkspaceType } from '@/lib/types'

export const typeIconSrc: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  hermes: hermesIcon
}

export const typeLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude Code',
  openclaw: 'OpenClaw',
  hermes: 'Hermes'
}

type TypeIconProps = {
  type: WorkspaceType
  className?: string
}

export function TypeIcon({ type, className }: TypeIconProps) {
  return (
    <img
      src={typeIconSrc[type]}
      alt=""
      aria-label={typeLabel[type]}
      className={cn('size-4 shrink-0', className)}
    />
  )
}
