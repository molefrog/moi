import { describe, expect, test } from 'bun:test'
import type { SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk'

import {
  claudeSessionTitleCommand,
  parseClaudeSessionTitleOutput,
  renameClaudeSessionIfUnchanged
} from './session-title'

function optionValue(command: readonly string[], option: string): string | undefined {
  const index = command.indexOf(option)
  return index >= 0 ? command[index + 1] : undefined
}

test('Claude session-title command is ephemeral and has no tools or customizations', () => {
  const command = claudeSessionTitleCommand('/bin/claude')
  expect(command[0]).toBe('/bin/claude')
  expect(optionValue(command, '--model')).toBe('haiku')
  expect(optionValue(command, '--effort')).toBe('low')
  expect(optionValue(command, '--max-turns')).toBe('1')
  expect(optionValue(command, '--tools')).toBe('')
  expect(optionValue(command, '--setting-sources')).toBe('')
  expect(optionValue(command, '--permission-mode')).toBe('dontAsk')
  expect(command).toContain('--safe-mode')
  expect(command).toContain('--no-session-persistence')
  expect(command).toContain('--disable-slash-commands')
  expect(command).toContain('--strict-mcp-config')
  expect(command).toContain('--json-schema')
})

test('Claude session-title output requires structured JSON', () => {
  expect(
    parseClaudeSessionTitleOutput('{"structured_output":{"title":"Review authentication flow"}}')
  ).toBe('Review authentication flow')
  expect(parseClaudeSessionTitleOutput('{"result":"Review authentication flow"}')).toBeNull()
  expect(parseClaudeSessionTitleOutput('Review authentication flow')).toBeNull()
})

function sessionInfo(overrides: Partial<SDKSessionInfo> = {}): SDKSessionInfo {
  return {
    sessionId: 'session-1',
    summary: 'Raw first prompt',
    firstPrompt: 'Raw first prompt',
    lastModified: 1,
    ...overrides
  }
}

describe('renameClaudeSessionIfUnchanged', () => {
  test('renames only the raw first-prompt fallback', async () => {
    const titles: string[] = []
    expect(
      await renameClaudeSessionIfUnchanged(
        {
          sessionId: 'session-1',
          workspacePath: '/workspace',
          title: 'Review authentication flow'
        },
        {
          getSessionInfo: async () => sessionInfo(),
          renameSession: async (_sessionId, title) => {
            titles.push(title)
          }
        }
      )
    ).toBe(true)
    expect(titles).toEqual(['Review authentication flow'])
  })

  test('preserves generated, custom, and replaced-session titles', async () => {
    for (const [info, isCurrent] of [
      [sessionInfo({ summary: 'Native title' }), true],
      [sessionInfo({ customTitle: 'Manual title' }), true],
      [sessionInfo(), false]
    ] as const) {
      let renamed = false
      expect(
        await renameClaudeSessionIfUnchanged(
          {
            sessionId: 'session-1',
            workspacePath: '/workspace',
            title: 'Generated title',
            isCurrent: () => isCurrent
          },
          {
            getSessionInfo: async () => info,
            renameSession: async () => {
              renamed = true
            }
          }
        )
      ).toBe(false)
      expect(renamed).toBe(false)
    }
  })
})
