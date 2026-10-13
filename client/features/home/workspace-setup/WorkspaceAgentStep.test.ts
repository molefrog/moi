import { describe, expect, test } from 'bun:test'

import {
  getCreateWorkspaceAgentOptions,
  getImportWorkspaceAgentOptions,
  resolveWorkspaceAgentSelection
} from './workspace-agent-options'
import type { HarnessInstallations } from '@/lib/types'

describe('create workspace agent options', () => {
  for (let mask = 0; mask < 16; mask++) {
    const installed: HarnessInstallations = {
      'claude-code': Boolean(mask & 1),
      codex: Boolean(mask & 2),
      openclaw: Boolean(mask & 4),
      hermes: Boolean(mask & 8)
    }
    test(`handles installation combination ${mask}`, () => {
      const options = getCreateWorkspaceAgentOptions(installed)
      expect(options.map(option => option.type)).toEqual([
        'claude-code',
        'codex',
        ...(installed.openclaw ? ['openclaw' as const] : []),
        ...(installed.hermes ? ['hermes' as const] : [])
      ])
      expect(options.find(option => option.type === 'claude-code')?.disabled).toBe(
        !installed['claude-code']
      )
      expect(options.find(option => option.type === 'codex')?.disabled).toBe(!installed.codex)
      for (const type of ['openclaw', 'hermes'] as const) {
        if (installed[type])
          expect(options.find(option => option.type === type)).toMatchObject({
            disabled: true,
            disabledCommand: `moi ${type} init`
          })
      }
      expect(resolveWorkspaceAgentSelection(options, 'claude-code')).toBe(
        installed['claude-code'] ? 'claude-code' : installed.codex ? 'codex' : undefined
      )
    })
  }

  test('provides install instructions for missing primary agents', () => {
    const options = getCreateWorkspaceAgentOptions({
      'claude-code': false,
      codex: false,
      openclaw: false,
      hermes: false
    })
    expect(options.map(option => option.disabledReason)).toEqual([
      'Run in terminal to install Claude Code:',
      'Run in terminal to install Codex:'
    ])
    expect(options.map(option => option.disabledCommand)).toEqual([
      'curl -fsSL https://claude.ai/install.sh | sh',
      'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
    ])
  })

  test('uses only installation flags to enable primary agents', () => {
    const options = getCreateWorkspaceAgentOptions({
      'claude-code': true,
      codex: true,
      openclaw: true,
      hermes: true
    })
    expect(options.map(option => option.disabled)).toEqual([false, false, true, true])
  })

  test('waits for installation data before showing cards', () => {
    expect(getCreateWorkspaceAgentOptions()).toEqual([])
  })
})

describe('getImportWorkspaceAgentOptions', () => {
  test('returns every agent in canonical order', () => {
    const options = getImportWorkspaceAgentOptions({
      detectedTypes: ['openclaw', 'hermes']
    })

    expect(options.map(option => option.type)).toEqual([
      'claude-code',
      'codex',
      'openclaw',
      'hermes'
    ])
    expect(options.every(option => !option.disabled)).toBe(true)
  })

  test.each([
    {
      type: 'claude-code' as const,
      description: 'Anthropic',
      reason: 'Run in terminal to install Claude Code: curl -fsSL https://claude.ai/install.sh | sh'
    },
    {
      type: 'codex' as const,
      description: 'OpenAI',
      reason:
        'Run in terminal to install Codex: curl -fsSL https://chatgpt.com/codex/install.sh | sh'
    }
  ])('keeps the vendor description and exposes the disabled reason for $type', input => {
    const options = getImportWorkspaceAgentOptions({
      availability: { [input.type]: { status: 'unavailable', reason: input.reason } },
      detectedTypes: ['openclaw']
    })

    expect(options.find(option => option.type === input.type)).toMatchObject({
      description: input.description,
      disabled: true,
      disabledReason: `Run in terminal to install ${input.type === 'claude-code' ? 'Claude Code' : 'Codex'}:`,
      disabledCommand:
        input.type === 'claude-code'
          ? 'curl -fsSL https://claude.ai/install.sh | sh'
          : 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
    })
  })

  test('locks OpenClaw when it was not detected', () => {
    const options = getImportWorkspaceAgentOptions({})

    expect(options.find(option => option.type === 'openclaw')).toMatchObject({
      disabled: true,
      disabledReason: 'Run in terminal to connect OpenClaw:',
      disabledCommand: 'moi openclaw init'
    })
  })

  test('enables OpenClaw when it was detected', () => {
    const options = getImportWorkspaceAgentOptions({ detectedTypes: ['openclaw'] })

    expect(options.find(option => option.type === 'openclaw')).toMatchObject({
      type: 'openclaw',
      description: 'Open-source',
      disabled: false
    })
  })

  test('locks Hermes when it was not detected', () => {
    const options = getImportWorkspaceAgentOptions({})

    expect(options.find(option => option.type === 'hermes')).toMatchObject({
      disabled: true,
      disabledReason: 'Run in terminal to connect Hermes:',
      disabledCommand: 'moi hermes init'
    })
  })

  test('enables Hermes when it was detected', () => {
    const options = getImportWorkspaceAgentOptions({ detectedTypes: ['hermes'] })

    expect(options.find(option => option.type === 'hermes')).toMatchObject({
      type: 'hermes',
      description: 'Nous Research',
      disabled: false
    })
  })

  test('falls back to the first unlocked agent when the selection is locked', () => {
    const options = getImportWorkspaceAgentOptions({
      availability: {
        'claude-code': { status: 'unavailable', reason: 'Install Claude' },
        codex: { status: 'available' }
      }
    })

    expect(resolveWorkspaceAgentSelection(options, 'claude-code')).toBe('codex')
  })

  test('keeps an unlocked selection and returns nothing when every agent is locked', () => {
    const options = getImportWorkspaceAgentOptions({
      availability: {
        'claude-code': { status: 'unavailable', reason: 'Install Claude' },
        codex: { status: 'unavailable', reason: 'Install Codex' }
      }
    })

    expect(resolveWorkspaceAgentSelection(options, 'codex')).toBeUndefined()
    expect(
      resolveWorkspaceAgentSelection(
        getImportWorkspaceAgentOptions({ detectedTypes: ['openclaw'] }),
        'openclaw'
      )
    ).toBe('openclaw')
  })
})
