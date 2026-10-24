import type { HarnessAvailability, McpServer, WorkspaceAgent } from '@/lib/types'

// Server answers that depend on the machine (which agent CLIs are installed,
// signed in, and which models their version lists), pinned so every machine
// renders the same chat composer, create dialog and connectors.

export const MODELS: WorkspaceAgent['models'] = [
  {
    value: 'default',
    resolvedModel: 'claude-opus-5-5',
    displayName: 'Default (recommended)',
    description: 'Use the default model (currently Opus 5.5) · $4/$20 per Mtok',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    supportsAdaptiveThinking: true,
    supportsFastMode: true,
    supportsAutoMode: true,
    defaultFastMode: false
  },
  {
    value: 'opus',
    resolvedModel: 'claude-opus-5-5',
    displayName: 'Opus',
    description: 'Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    supportsAdaptiveThinking: true,
    supportsFastMode: true,
    supportsAutoMode: true,
    defaultFastMode: false
  },
  {
    value: 'sonnet',
    resolvedModel: 'claude-sonnet-5-5',
    displayName: 'Sonnet',
    description: 'Sonnet 5.5 · Efficient for routine tasks · $2/$10 per Mtok',
    supportsEffort: true,
    supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    supportsAdaptiveThinking: true,
    supportsAutoMode: true
  }
]

export function agentResponse(availability: HarnessAvailability): WorkspaceAgent {
  return {
    provider: 'claude-code',
    availability,
    models: MODELS,
    supportsStreaming: true,
    supportsArchiving: true
  }
}

export const CREATE_WORKSPACE_INFO = {
  installed: { 'claude-code': true, codex: true, openclaw: false, hermes: false }
}

export const CONNECTORS: McpServer[] = [
  { name: 'linear', status: 'connected' },
  { name: 'postgres', status: 'connected' },
  { name: 'stripe', status: 'needs-auth' },
  { name: 'sentry', status: 'failed' }
]
