import claudeIcon from '@/client/assets/claude.svg'
import openaiIcon from '@/client/assets/openai.svg'
import openclawIcon from '@/client/assets/openclaw.svg'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

export const workspaceProviderIcon: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  codex: openaiIcon
}

export const workspaceTypeLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude Code',
  openclaw: 'OpenClaw',
  codex: 'Codex'
}

type WorkspaceAgentIconsProps = {
  types: WorkspaceType[]
}

export function WorkspaceAgentIcons({ types }: WorkspaceAgentIconsProps) {
  const label = types.map(type => workspaceTypeLabel[type]).join(', ')

  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center -space-x-0.5">
      {types.map(type => (
        <img
          key={type}
          src={workspaceProviderIcon[type]}
          alt=""
          className="size-4 shrink-0 rounded-full bg-muted ring-2 ring-muted"
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
