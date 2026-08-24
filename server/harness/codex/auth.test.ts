import { expect, test } from 'bun:test'

import { codexAccountReadiness } from './auth'

test('requires a Codex login for an unauthenticated OpenAI provider', () => {
  expect(codexAccountReadiness({ account: null, requiresOpenaiAuth: true })).toEqual({
    status: 'login-required',
    reason: 'Codex is signed out. Sign in to send messages'
  })
})

test('accepts a Codex account or a provider that does not require OpenAI auth', () => {
  expect(
    codexAccountReadiness({
      account: { type: 'chatgpt', email: null, planType: 'plus' },
      requiresOpenaiAuth: true
    })
  ).toEqual({ status: 'available' })
  expect(codexAccountReadiness({ account: null, requiresOpenaiAuth: false })).toEqual({
    status: 'available'
  })
})

test('reports malformed Codex account responses as unavailable', () => {
  const unavailable = {
    status: 'unavailable',
    reason: 'Could not check the Codex login status'
  } as const

  for (const response of [
    null,
    { requiresOpenaiAuth: true },
    { account: 'unexpected', requiresOpenaiAuth: true },
    { account: {}, requiresOpenaiAuth: true }
  ]) {
    expect(codexAccountReadiness(response)).toEqual(unavailable)
  }
})
