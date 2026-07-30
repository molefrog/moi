import { describe, expect, test } from 'bun:test'

import { archiveCodexThread, codexSupportsAdditionalContext, interruptCodexTurn } from './client'

describe('codexSupportsAdditionalContext', () => {
  test('accepts versions at and above 0.135.0', () => {
    expect(codexSupportsAdditionalContext('codex_cli_rs/0.135.0 (Linux x86_64)')).toBe(true)
    expect(codexSupportsAdditionalContext('codex_cli_rs/0.144.5 (Mac OS 15.1)')).toBe(true)
    expect(codexSupportsAdditionalContext('codex_cli_rs/1.0.0')).toBe(true)
  })

  test('rejects versions below 0.135.0', () => {
    expect(codexSupportsAdditionalContext('codex_cli_rs/0.134.9 (Linux x86_64)')).toBe(false)
    expect(codexSupportsAdditionalContext('codex_cli_rs/0.99.0')).toBe(false)
  })

  test('gates to false on missing or unparsable userAgent', () => {
    expect(codexSupportsAdditionalContext(undefined)).toBe(false)
    expect(codexSupportsAdditionalContext('')).toBe(false)
    expect(codexSupportsAdditionalContext('codex_cli_rs')).toBe(false)
  })
})

test('Codex interrupt and archive use the expected RPC order', async () => {
  const calls: { method: string; params?: Record<string, unknown> }[] = []
  const client = {
    rpc: async <T>(method: string, params?: Record<string, unknown>) => {
      calls.push({ method, params })
      return undefined as T
    }
  }

  await interruptCodexTurn(client, 'thread-1', 'turn-1')
  await archiveCodexThread(client, 'thread-1')

  expect(calls).toEqual([
    {
      method: 'turn/interrupt',
      params: { threadId: 'thread-1', turnId: 'turn-1' }
    },
    {
      method: 'thread/archive',
      params: { threadId: 'thread-1' }
    }
  ])
})
