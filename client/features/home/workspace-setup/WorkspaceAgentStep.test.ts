import { describe, expect, test } from 'bun:test'

import { getWorkspaceAgentOptions, isWorkspaceAgentDisabled } from './WorkspaceAgentStep'

describe('getWorkspaceAgentOptions', () => {
  test('returns every agent in canonical order', () => {
    const options = getWorkspaceAgentOptions({ detectedTypes: ['openclaw'] })

    expect(options.map(option => option.type)).toEqual(['claude-code', 'codex', 'openclaw'])
    expect(options.every(option => !option.disabled)).toBe(true)
  })

  test.each([
    {
      type: 'claude-code' as const,
      description: 'By Anthropic',
      reason: 'Run curl -fsSL https://claude.ai/install.sh | sh in your terminal to install Claude'
    },
    {
      type: 'codex' as const,
      description: 'By OpenAI',
      reason:
        'Run curl -fsSL https://chatgpt.com/codex/install.sh | sh in your terminal to install Codex'
    }
  ])('keeps the vendor description and exposes the disabled reason for $type', input => {
    const options = getWorkspaceAgentOptions({
      availability: { [input.type]: { available: false, reason: input.reason } },
      detectedTypes: ['openclaw']
    })

    expect(options.find(option => option.type === input.type)).toMatchObject({
      description: input.description,
      disabled: true,
      disabledReason: input.reason
    })
    expect(isWorkspaceAgentDisabled(options, input.type)).toBe(true)
  })

  test('locks OpenClaw when it was not detected', () => {
    const options = getWorkspaceAgentOptions({})

    expect(options.find(option => option.type === 'openclaw')).toMatchObject({
      disabled: true,
      disabledReason: 'Initialize OpenClaw in the folder\nmanually, then import it to moi'
    })
  })

  test('enables OpenClaw when it was detected', () => {
    const options = getWorkspaceAgentOptions({ detectedTypes: ['openclaw'] })

    expect(options.find(option => option.type === 'openclaw')).toEqual({
      type: 'openclaw',
      description: 'Open-source',
      disabled: false
    })
  })
})
