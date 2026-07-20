import { describe, expect, test } from 'bun:test'

import { workspaceAgentIsDisabled, workspaceAgentOptions } from './workspace-agent-options'

describe('workspaceAgentOptions', () => {
  test('returns every agent in canonical order', () => {
    const options = workspaceAgentOptions({ openClawSelectable: true })

    expect(options.map(option => option.type)).toEqual(['claude-code', 'codex', 'openclaw'])
    expect(options.every(option => !option.disabled)).toBe(true)
  })

  test('uses backend availability for Codex', () => {
    const reason = 'Codex CLI not found'
    const options = workspaceAgentOptions({
      availability: { codex: { available: false, reason } },
      openClawSelectable: true
    })

    expect(options.find(option => option.type === 'codex')).toMatchObject({
      description: reason,
      disabled: true
    })
    expect(workspaceAgentIsDisabled(options, 'codex')).toBe(true)
    expect(workspaceAgentIsDisabled(options, 'claude-code')).toBe(false)
  })

  test('locks OpenClaw when it was not detected', () => {
    const options = workspaceAgentOptions({ openClawSelectable: false })

    expect(options.find(option => option.type === 'openclaw')).toMatchObject({
      disabled: true,
      lockedDescription: 'Initialize OpenClaw in the folder\nmanually, then import it to moi'
    })
  })

  test('enables OpenClaw when it was detected', () => {
    const options = workspaceAgentOptions({ openClawSelectable: true })

    expect(options.find(option => option.type === 'openclaw')).toEqual({
      type: 'openclaw',
      description: 'Open-source',
      disabled: false
    })
  })
})
