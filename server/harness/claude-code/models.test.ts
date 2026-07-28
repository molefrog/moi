import { describe, expect, test } from 'bun:test'

import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import { withClaudeFastModeDefault } from './models'

function model(value: string, supportsFastMode: boolean): ModelInfo {
  return {
    value,
    displayName: value,
    description: value,
    supportsFastMode
  }
}

describe('withClaudeFastModeDefault', () => {
  test('adds the resolved default only to Fast-capable models', () => {
    expect(
      withClaudeFastModeDefault([model('supported', true), model('unsupported', false)], true)
    ).toEqual([
      {
        value: 'supported',
        displayName: 'supported',
        description: 'supported',
        supportsFastMode: true,
        defaultFastMode: true
      },
      {
        value: 'unsupported',
        displayName: 'unsupported',
        description: 'unsupported',
        supportsFastMode: false
      }
    ])
  })

  test('preserves an explicitly disabled provider default', () => {
    expect(withClaudeFastModeDefault([model('supported', true)], false)[0]?.defaultFastMode).toBe(
      false
    )
  })
})
