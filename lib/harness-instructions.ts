import type { WorkspaceType } from './types'

type HarnessInstruction = {
  reason: string
  command: string
}

export const HARNESS_INSTRUCTIONS: Record<WorkspaceType, HarnessInstruction> = {
  'claude-code': {
    reason: 'Run in terminal to install Claude Code:',
    command: 'curl -fsSL https://claude.ai/install.sh | sh'
  },
  codex: {
    reason: 'Run in terminal to install Codex:',
    command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
  },
  openclaw: {
    reason: 'Run in terminal to connect OpenClaw:',
    command: 'moi openclaw init'
  },
  hermes: {
    reason: 'Run in terminal to connect Hermes:',
    command: 'moi hermes init'
  }
}

export function harnessInstructionMessage(type: WorkspaceType): string {
  const { reason, command } = HARNESS_INSTRUCTIONS[type]
  return `${reason} ${command}`
}
