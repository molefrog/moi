import type { WorkspaceType } from '@/lib/types'
export { workspaceProviderIcon as harnessIcon } from '@/client/components/shared/workspace-icon'
export const harnessLabel: Record<WorkspaceType, string> = {
  'claude-code': 'Claude',
  openclaw: 'OpenClaw',
  codex: 'ChatGPT',
  hermes: 'Hermes'
}

export const harnessDescription: Record<WorkspaceType, string> = {
  'claude-code': 'Anthropic',
  codex: 'OpenAI',
  openclaw: 'Open-source',
  hermes: 'Nous Research'
}
