import { expect, test } from 'bun:test'

import { parseClaudeAuthStatus } from './auth'

test('parses Claude auth status JSON', () => {
  expect(parseClaudeAuthStatus('{"loggedIn":true,"authMethod":"claude.ai"}')).toBe(true)
  expect(parseClaudeAuthStatus('{"loggedIn":false,"authMethod":"none"}')).toBe(false)
})

test('rejects malformed or incomplete Claude auth status', () => {
  expect(parseClaudeAuthStatus('{}')).toBeNull()
  expect(parseClaudeAuthStatus('not json')).toBeNull()
})
