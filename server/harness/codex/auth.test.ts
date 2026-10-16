import { expect, test, spyOn } from 'bun:test'

import * as clientModule from './client'
import type { CodexClient } from './client'
import { CodexRpcError, type NotificationListener } from './transport'
import * as config from '../../app-config'
import * as browser from '../../open-browser'

import {
  codexAccountReadiness,
  codexOutdatedAvailability,
  getCodexAuthReadiness,
  startCodexLogin
} from './auth'

test('verifies ChatGPT access even when account/read still returns a signed-in account', async () => {
  let error: Error | undefined = new CodexRpcError(
    'failed to fetch codex rate limits: http error with status 401 Unauthorized',
    -32603
  )
  const calls: string[] = []
  let account: unknown = { account: { type: 'chatgpt' }, requiresOpenaiAuth: true }
  const client = {
    rpc: async (method: string) => {
      calls.push(method)
      if (method === 'account/read') return account
      if (error) throw error
      return { rateLimits: {} }
    }
  } as unknown as CodexClient // This probe only uses RPC and the optional CLI version.
  const getClient = spyOn(clientModule, 'getCodexClient').mockResolvedValue(client)
  try {
    expect((await getCodexAuthReadiness()).status).toBe('login-required')
    expect(calls).toEqual(['account/read', 'account/rateLimits/read'])
    // Another metadata read cannot unlock revoked credentials.
    expect((await getCodexAuthReadiness()).status).toBe('login-required')
    error = undefined
    expect((await getCodexAuthReadiness()).status).toBe('available')

    for (const failure of [
      new Error('request timed out'),
      new CodexRpcError('HTTP 429 Too Many Requests', -32603),
      new CodexRpcError('HTTP 503 Service Unavailable', -32603)
    ]) {
      error = failure
      await expect(getCodexAuthReadiness()).rejects.toThrow(failure.message)
    }

    for (account of [
      { account: { type: 'apiKey' }, requiresOpenaiAuth: true },
      { account: null, requiresOpenaiAuth: false }
    ]) {
      calls.length = 0
      expect((await getCodexAuthReadiness()).status).toBe('available')
      expect(calls).toEqual(['account/read'])
    }
  } finally {
    getClient.mockRestore()
  }
})

test('requires a Codex login for an unauthenticated OpenAI provider', () => {
  expect(codexAccountReadiness({ account: null, requiresOpenaiAuth: true })).toEqual({
    status: 'login-required',
    reason: 'ChatGPT is signed out. Sign in to send messages'
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
    reason: 'Could not check the ChatGPT login status'
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
    reason: 'ChatGPT 0.45.0 is out of date. Update ChatGPT to 0.89.0 or newer'
  })
})

test('does not flag supported or unknown Codex versions', () => {
  expect(codexOutdatedAvailability('0.150.1')).toBeUndefined()
  expect(codexOutdatedAvailability(undefined)).toBeUndefined()
})

test('Codex chooses browser or device auth and tracks completion and cancellation', async () => {
  const appConfig = config.getAppConfig()
  const cfg = spyOn(config, 'getAppConfig')
  const open = spyOn(browser, 'openBrowser').mockResolvedValue(undefined)
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
      open.mockClear()
      cfg.mockReturnValue({ ...appConfig, environment })
      const login = await startCodexLogin()
      expect(calls.at(-1)?.params).toMatchObject({
        type: environment === 'cloud' ? 'chatgptDeviceCode' : 'chatgpt'
      })
      if (environment === 'local') expect(open).toHaveBeenCalledWith(login.url)
      else expect(open).not.toHaveBeenCalled()
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
    open.mockRestore()
  }
})
