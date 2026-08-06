import { expect, test } from 'bun:test'

import { codexAccountReadiness } from './auth'

test('requires a Codex login for an unauthenticated OpenAI provider', () => {
  expect(codexAccountReadiness({ account: null, requiresOpenaiAuth: true })).toEqual({
    available: false,
    reason: 'Codex is signed out. Sign in to send messages',
    loginCommand: 'codex login'
  })
})

test('accepts a Codex account or a provider that does not require OpenAI auth', () => {
  expect(
    codexAccountReadiness({
      account: { type: 'chatgpt', email: null, planType: 'plus' },
      requiresOpenaiAuth: true
    })
  ).toEqual({ available: true })
  expect(codexAccountReadiness({ account: null, requiresOpenaiAuth: false })).toEqual({
    available: true
  })
})
