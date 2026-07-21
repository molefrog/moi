import { describe, expect, test } from 'bun:test'

import { codexSupportsAdditionalContext } from './client'

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
