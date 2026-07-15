import claudeIcon from '@/client/assets/claude.svg'
import openclawIcon from '@/client/assets/openclaw.svg'
import { cn } from '@/client/lib/cn'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

export const workspaceProviderIcon: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon
}

export const workspaceTypeLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude',
  openclaw: 'OpenClaw'
}

type WorkspaceTypeIconProps = {
  type: WorkspaceType
  className?: string
}

export function WorkspaceTypeIcon({ type, className }: WorkspaceTypeIconProps) {
  return (
    <img
      src={workspaceProviderIcon[type]}
      alt=""
      aria-label={workspaceTypeLabel[type]}
      className={cn('size-4 shrink-0', className)}
    />
  )
}

type WorkspaceDisplaySource = Pick<
  WorkspaceEntry | DiscoveredWorkspace,
  'name' | 'path' | 'type' | 'agentId'
>

export function workspaceDisplayName(workspace: WorkspaceDisplaySource): string {
  if (workspace.name) return workspace.name
  if (workspace.type === 'openclaw') return workspace.agentId ?? 'OpenClaw agent'
  return workspace.path.split('/').pop() || workspace.path
}
