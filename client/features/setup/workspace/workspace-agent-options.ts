import { HARNESS_INSTRUCTIONS } from '@/lib/harness-instructions'
import type { HarnessAvailability, HarnessInstallations, WorkspaceType } from '@/lib/types'
import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'

type WorkspaceAgentConfig = {
  description: string
  importOnly: boolean
}

const workspaceAgents: Record<WorkspaceType, WorkspaceAgentConfig> = {
  'claude-code': { description: 'Anthropic', importOnly: false },
  codex: { description: 'OpenAI', importOnly: false },
  openclaw: { description: 'Open-source', importOnly: true },
  hermes: { description: 'Nous Research', importOnly: true }
}

export type WorkspaceAgentOption = {
  type: WorkspaceType
  description: string
  disabled: boolean
  disabledReason?: string
  disabledCommand?: string
}

export function getCreateWorkspaceAgentOptions(
  installed?: HarnessInstallations
): WorkspaceAgentOption[] {
  if (!installed) return []
  return WORKSPACE_TYPE_ORDER.filter(
    type => installed[type] || !workspaceAgents[type].importOnly
  ).map(type => {
    const config = workspaceAgents[type]
    const instruction = HARNESS_INSTRUCTIONS[type]
    const disabled = config.importOnly || !installed[type]
    return {
      type,
      description: config.description,
      disabled,
      disabledReason: disabled ? instruction.reason : undefined,
      disabledCommand: disabled ? instruction.command : undefined
    }
  })
}

type ImportWorkspaceAgentOptionsInput = {
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  detectedTypes?: WorkspaceType[]
}

export function getImportWorkspaceAgentOptions({
  availability,
  detectedTypes = []
}: ImportWorkspaceAgentOptionsInput): WorkspaceAgentOption[] {
  return WORKSPACE_TYPE_ORDER.map(type => {
    const config = workspaceAgents[type]
    const instruction = HARNESS_INSTRUCTIONS[type]
    const state = availability?.[type]
    const unavailableReason = state && state.status !== 'available' ? state.reason : undefined
    const needsImport = config.importOnly && !detectedTypes.includes(type)
    const showInstruction =
      (!config.importOnly && state?.status === 'unavailable') || (!unavailableReason && needsImport)
    const disabledReason = showInstruction ? instruction.reason : unavailableReason
    return {
      type,
      description: config.description,
      disabled: Boolean(disabledReason),
      disabledReason,
      disabledCommand: showInstruction ? instruction.command : undefined
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
