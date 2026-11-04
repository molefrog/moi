import { workspaceProviderIcon } from '@/client/components/shared/workspace-icon'
import type { DiscoveredWorkspace, WorkspaceEntry, WorkspaceType } from '@/lib/types'

import { harnessLabel as workspaceTypeLabel } from '@/client/features/harness/harness-presentation'
export {
  harnessLabel as workspaceTypeLabel,
  harnessDescription as workspaceTypeDescription
} from '@/client/features/harness/harness-presentation'

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
  if (workspace.type === 'hermes') return workspace.agentId ?? 'Hermes agent'
  return workspace.path.split('/').pop() || workspace.path
}
