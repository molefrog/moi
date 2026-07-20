import claudeIcon from '@/client/assets/claude.svg'
import openaiIcon from '@/client/assets/openai.svg'
import openclawIcon from '@/client/assets/openclaw.svg'
import { cn } from '@/client/lib/cn'
import { orderWorkspaceTypes } from '@/lib/workspace-types'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

export const workspaceProviderIcon: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  codex: openaiIcon
}

export const workspaceTypeLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude',
  openclaw: 'OpenClaw',
  codex: 'Codex'
}

type WorkspaceAgentIconProps = {
  type: WorkspaceType | WorkspaceType[]
  className?: string
}

export function WorkspaceAgentIcon({ type, className }: WorkspaceAgentIconProps) {
  const types = orderWorkspaceTypes(Array.isArray(type) ? type : [type])
  const label = types.map(workspaceType => workspaceTypeLabel[workspaceType]).join(', ')

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('inline-flex shrink-0 items-center -space-x-0.5', className)}
    >
      {types.map(workspaceType => (
        <img
          key={workspaceType}
          src={workspaceProviderIcon[workspaceType]}
          alt=""
          className={cn('size-4 shrink-0 rounded-full bg-muted ring-2 ring-muted', className)}
        />
      ))}
    </span>
  )
}

type WorkspaceDisplaySource = WorkspaceEntry | DiscoveredWorkspace

export function workspaceDisplayName(workspace: WorkspaceDisplaySource): string {
  if ('types' in workspace) return workspace.path.split('/').pop() || workspace.path
  if (workspace.name) return workspace.name
  if (workspace.type === 'openclaw') return workspace.agentId ?? 'OpenClaw agent'
  return workspace.path.split('/').pop() || workspace.path
}
