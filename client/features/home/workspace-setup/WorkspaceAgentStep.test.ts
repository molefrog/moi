import { describe, expect, test } from 'bun:test'

import { getWorkspaceAgentOptions, isWorkspaceAgentDisabled } from './WorkspaceAgentStep'

describe('getWorkspaceAgentOptions', () => {
  test('returns every agent in canonical order', () => {
    const options = getWorkspaceAgentOptions({ detectedTypes: ['openclaw'] })

    expect(options.map(option => option.type)).toEqual(['claude-code', 'codex', 'openclaw'])
    expect(options.every(option => !option.disabled)).toBe(true)
  })

  test('uses backend availability for Codex', () => {
    const reason = 'Codex CLI not found'
    const options = getWorkspaceAgentOptions({
      availability: { codex: { available: false, reason } },
      detectedTypes: ['openclaw']
    })

    expect(options.find(option => option.type === 'codex')).toMatchObject({
      description: reason,
      disabled: true
    })
    expect(isWorkspaceAgentDisabled(options, 'codex')).toBe(true)
    expect(isWorkspaceAgentDisabled(options, 'claude-code')).toBe(false)
  })

  test('locks OpenClaw when it was not detected', () => {
    const options = getWorkspaceAgentOptions({})

    expect(options.find(option => option.type === 'openclaw')).toMatchObject({
      disabled: true,
      lockedDescription: 'Initialize OpenClaw in the folder\nmanually, then import it to moi'
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
