import type { Options } from '@anthropic-ai/claude-agent-sdk'

export type ClaudeSessionAccessOptions = Pick<Options, 'permissionMode'>

export function claudeSessionAccessOptions(): ClaudeSessionAccessOptions {
  return { permissionMode: 'auto' }
}
