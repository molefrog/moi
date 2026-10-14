import { expect, test, spyOn } from 'bun:test'

import * as clientModule from './client'
import type { CodexClient } from './client'
import type { NotificationListener } from './transport'
import * as config from '../../app-config'

import { codexAccountReadiness, codexOutdatedAvailability, startCodexLogin } from './auth'

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

test('Codex chooses browser or device auth and tracks completion and cancellation', async () => {
  const appConfig = config.getAppConfig()
  const cfg = spyOn(config, 'getAppConfig')
  let listener: NotificationListener = () => {}
  const calls: { method: string; params: unknown }[] = []
  const client = {
    rpc: async (method: string, params: unknown) => {
      calls.push({ method, params })
      return {
        type: 'chatgpt',
        loginId: 'test-login',
        authUrl: 'https://auth.openai.com/authorize',
        verificationUrl: 'https://auth.openai.com/codex/device',
        userCode: 'ABCD-1234'
      }
    },
    onNotification: (callback: NotificationListener) => {
      listener = callback
      return () => {}
    }
  } as unknown as CodexClient // Only the RPC and notification surface is used by login.
  const getClient = spyOn(clientModule, 'getCodexClient').mockResolvedValue(client)
  try {
    for (const environment of ['local', 'cloud'] as const) {
      cfg.mockReturnValue({ ...appConfig, environment })
      const login = await startCodexLogin()
      expect(calls.at(-1)?.params).toMatchObject({
        type: environment === 'cloud' ? 'chatgptDeviceCode' : 'chatgpt'
      })
      expect(login.userCode).toBe(environment === 'cloud' ? 'ABCD-1234' : undefined)
      listener('account/login/completed', { loginId: 'test-login', success: true })
      await login.completed
      await login.cancel?.()
      expect(calls.at(-1)).toEqual({
        method: 'account/login/cancel',
        params: { loginId: 'test-login' }
      })
    }
  } finally {
    getClient.mockRestore()
    cfg.mockRestore()
  }
})
