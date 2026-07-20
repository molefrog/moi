import { WORKSPACE_TYPE_ORDER } from '@/lib/workspace-types'
import type { HarnessAvailability, WorkspaceType } from '@/lib/types'

export const workspaceAgentDescription: Record<WorkspaceType, string> = {
  'claude-code': 'By Anthropic',
  codex: 'By OpenAI',
  openclaw: 'Open-source'
}

export type WorkspaceAgentOption = {
  type: WorkspaceType
  description: string
  disabled?: boolean
  lockedDescription?: string
}

type WorkspaceAgentOptionsInput = {
  availability?: Partial<Record<WorkspaceType, HarnessAvailability>>
  openClawSelectable: boolean
}

const OPENCLAW_LOCKED_DESCRIPTION =
  'Initialize OpenClaw in the folder\nmanually, then import it to moi'

export function workspaceAgentOptions({
  availability,
  openClawSelectable
}: WorkspaceAgentOptionsInput): WorkspaceAgentOption[] {
  return WORKSPACE_TYPE_ORDER.map(type => {
    const state = availability?.[type]
    const option: WorkspaceAgentOption = {
      type,
      description: state?.available === false ? state.reason : workspaceAgentDescription[type],
      disabled: state?.available === false
    }

    if (type === 'openclaw' && !openClawSelectable) {
      option.disabled = true
      option.lockedDescription = OPENCLAW_LOCKED_DESCRIPTION
    }

    return option
  })
}

export function workspaceAgentIsDisabled(
  options: WorkspaceAgentOption[],
  type: WorkspaceType
): boolean {
  return options.find(option => option.type === type)?.disabled === true
}
