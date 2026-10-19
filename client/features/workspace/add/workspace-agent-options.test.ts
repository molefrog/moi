import { describe, expect, test } from 'bun:test'

import { getWorkspaceAgentOptions, resolveWorkspaceAgentSelection } from './workspace-agent-options'
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
      const options = getWorkspaceAgentOptions(installed)
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
    const options = getWorkspaceAgentOptions({
      'claude-code': false,
      codex: false,
      openclaw: false,
      hermes: false
    })
    expect(options.map(option => option.disabledReason)).toEqual([
      'Run in terminal to install Claude:',
      'Run in terminal to install ChatGPT:'
    ])
    expect(options.map(option => option.disabledCommand)).toEqual([
      'curl -fsSL https://claude.ai/install.sh | sh',
      'curl -fsSL https://chatgpt.com/codex/install.sh | sh'
    ])
  })

  test('uses only installation flags to enable primary agents', () => {
    const options = getWorkspaceAgentOptions({
      'claude-code': true,
      codex: true,
      openclaw: true,
      hermes: true
    })
    expect(options.map(option => option.disabled)).toEqual([false, false, true, true])
  })

  test('waits for installation data before showing cards', () => {
    expect(getWorkspaceAgentOptions()).toEqual([])
  })
})

describe('import workspace agent options', () => {
  for (let mask = 0; mask < 16; mask++) {
    const installed: HarnessInstallations = {
      'claude-code': Boolean(mask & 1),
      codex: Boolean(mask & 2),
      openclaw: Boolean(mask & 4),
      hermes: Boolean(mask & 8)
    }
    test(`shares create visibility and installation rules for combination ${mask}`, () => {
      const createOptions = getWorkspaceAgentOptions(installed)
      // A detected folder never makes a missing installation selectable.
      const importOptions = getWorkspaceAgentOptions(installed, [
        'claude-code',
        'codex',
        'openclaw',
        'hermes'
      ])
      expect(importOptions.map(option => option.type)).toEqual(
        createOptions.map(option => option.type)
      )
      expect(
        importOptions.filter(option => option.type === 'claude-code' || option.type === 'codex')
      ).toEqual(
        createOptions.filter(option => option.type === 'claude-code' || option.type === 'codex')
      )
      for (const option of importOptions) {
        expect(option.disabled).toBe(!installed[option.type])
      }
    })
  }

  test.each(['openclaw', 'hermes'] as const)('only enables %s for folders it owns', type => {
    const installed: HarnessInstallations = {
      'claude-code': true,
      codex: true,
      openclaw: true,
      hermes: true
    }
    expect(getWorkspaceAgentOptions(installed).find(option => option.type === type)).toMatchObject({
      disabled: true,
      disabledCommand: `moi ${type} init`
    })
    const options = getWorkspaceAgentOptions(installed, [type])
    expect(options.find(option => option.type === type)).toMatchObject({
      disabled: false,
      disabledReason: undefined,
      disabledCommand: undefined
    })
    expect(resolveWorkspaceAgentSelection(options, type)).toBe(type)
  })

  test('waits for installation data even when a folder has a detected agent', () => {
    expect(getWorkspaceAgentOptions(undefined, ['codex', 'openclaw'])).toEqual([])
  })

  test('preserves a detected selection or falls back when it is no longer installed', () => {
    const installed: HarnessInstallations = {
      'claude-code': true,
      codex: true,
      openclaw: false,
      hermes: false
    }
    expect(
      resolveWorkspaceAgentSelection(getWorkspaceAgentOptions(installed, ['codex']), 'codex')
    ).toBe('codex')
    expect(
      resolveWorkspaceAgentSelection(
        getWorkspaceAgentOptions({ ...installed, codex: false }, ['codex']),
        'codex'
      )
    ).toBe('claude-code')
  })
})
