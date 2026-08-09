import { describe, expect, test } from 'bun:test'

import { stripSubagentEnvelope, stripUserMessageMetadata } from './strip'

// Envelope shape captured live from a spawned 2026.7.1 subagent session.
const SPAWN_TEXT =
  '[Subagent Context] You are running as a subagent (depth 1/1). Results auto-announce to your requester; do not busy-poll for status.\n\n' +
  '[Subagent Task]\n\nReply with the single word: pong\n\nBegin. Execute the assigned task to completion.'

describe('stripSubagentEnvelope', () => {
  test('extracts the task from a spawn envelope', () => {
    expect(stripSubagentEnvelope(SPAWN_TEXT)).toBe('Reply with the single word: pong')
  })

  test('falls back to a plain label when truncation cuts the task marker', () => {
    expect(stripSubagentEnvelope('[Subagent Context] You are running as a subagent (dep…')).toBe(
      'Subagent task'
    )
  })

  test('leaves ordinary text alone', () => {
    expect(stripSubagentEnvelope('Reply with pong')).toBe('Reply with pong')
  })

  test('applies through stripUserMessageMetadata', () => {
    expect(stripUserMessageMetadata(SPAWN_TEXT)).toBe('Reply with the single word: pong')
  })
})
