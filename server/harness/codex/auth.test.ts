import { expect, test } from 'bun:test'

import { codexAccountReadiness, codexOutdatedAvailability } from './auth'

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

test('reports an outdated Codex CLI with an update message', () => {
  expect(codexOutdatedAvailability('0.45.0')).toEqual({
    status: 'unavailable',
    reason: 'Codex 0.45.0 is out of date. Update Codex to 0.89.0 or newer'
  })
})

test('does not flag supported or unknown Codex versions', () => {
  expect(codexOutdatedAvailability('0.150.1')).toBeUndefined()
  expect(codexOutdatedAvailability(undefined)).toBeUndefined()
})
