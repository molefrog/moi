import { workspaceTypeDescription } from '@/client/features/workspace/workspace-presentation'
import { HARNESS_INSTRUCTIONS } from '@/lib/harness-instructions'
import type { HarnessInstallations, WorkspaceType } from '@/lib/types'
import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'

type WorkspaceAgentConfig = {
  importOnly: boolean
}

const workspaceAgents: Record<WorkspaceType, WorkspaceAgentConfig> = {
  'claude-code': { importOnly: false },
  codex: { importOnly: false },
  openclaw: { importOnly: true },
  hermes: { importOnly: true }
}

export type WorkspaceAgentOption = {
  type: WorkspaceType
  description: string
  disabled: boolean
  disabledReason?: string
  disabledCommand?: string
}

export function getWorkspaceAgentOptions(
  installed?: HarnessInstallations,
  detectedTypes: WorkspaceType[] = []
): WorkspaceAgentOption[] {
  if (!installed) return []
  return WORKSPACE_TYPE_ORDER.filter(
    type => installed[type] || !workspaceAgents[type].importOnly
  ).map(type => {
    const config = workspaceAgents[type]
    const instruction = HARNESS_INSTRUCTIONS[type]
    const disabled = !installed[type] || (config.importOnly && !detectedTypes.includes(type))
    return {
      type,
      description: workspaceTypeDescription[type],
      disabled,
      disabledReason: disabled ? instruction.reason : undefined,
      disabledCommand: disabled ? instruction.command : undefined
    }
  })
}

export function resolveWorkspaceAgentSelection(
  options: WorkspaceAgentOption[],
  selectedType: WorkspaceType
): WorkspaceType | undefined {
  const selected = options.find(option => option.type === selectedType)
  if (selected && !selected.disabled) return selected.type
  return options.find(option => !option.disabled)?.type
}
