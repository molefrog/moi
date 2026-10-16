import type { HarnessAvailability } from '@/lib/types'

import { getAppConfig } from '../../app-config'
import { openBrowser } from '../../open-browser'
import type { HarnessLoginAttempt } from '../types'

import { CODEX_MIN_SUPPORTED_VERSION, codexCliOutdated, getCodexClient } from './client'
import { CodexRpcError } from './transport'

type CodexAccount = { type: string }
type CodexAccountReadResponse = {
  account: CodexAccount | null
  requiresOpenaiAuth: boolean
}
type CodexLoginResponse = {
  type: string
  loginId: string
  authUrl?: string
  verificationUrl?: string
  userCode?: string
}

const CODEX_AVAILABLE: HarnessAvailability = { status: 'available' }
const CODEX_LOGIN_REQUIRED: HarnessAvailability = {
  status: 'login-required',
  reason: 'ChatGPT is signed out. Sign in to send messages'
}
const CODEX_AUTH_UNAVAILABLE: HarnessAvailability = {
  status: 'unavailable',
  reason: 'Could not check the ChatGPT login status'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCodexAccountReadResponse(value: unknown): value is CodexAccountReadResponse {
  return (
    isRecord(value) &&
    typeof value.requiresOpenaiAuth === 'boolean' &&
    (value.account === null || (isRecord(value.account) && typeof value.account.type === 'string'))
  )
}

export function codexAccountReadiness(response: unknown): HarnessAvailability {
  if (!isCodexAccountReadResponse(response)) return CODEX_AUTH_UNAVAILABLE

  if (response.requiresOpenaiAuth && response.account === null) return CODEX_LOGIN_REQUIRED
  return CODEX_AVAILABLE
}

// Report a known protocol-version mismatch before making the account probe.
export function codexOutdatedAvailability(
  cliVersion: string | undefined
): HarnessAvailability | undefined {
  if (!codexCliOutdated(cliVersion)) return undefined
  return {
    status: 'unavailable',
    reason: `ChatGPT ${cliVersion} is out of date. Update ChatGPT to ${CODEX_MIN_SUPPORTED_VERSION} or newer`
  }
}

export async function getCodexAuthReadiness(workspacePath?: string): Promise<HarnessAvailability> {
  const client = await getCodexClient(workspacePath)
  const outdated = codexOutdatedAvailability(client.cliVersion)
  if (outdated) return outdated
  try {
    const account = await client.rpc<unknown>('account/read', { refreshToken: true })
    const readiness = codexAccountReadiness(account)
    if (
      isCodexAccountReadResponse(account) &&
      account.requiresOpenaiAuth &&
      (account.account?.type === 'chatgpt' || account.account?.type === 'chatgptAuthTokens')
    ) {
      // account/read can return cached identity even after token refresh fails.
      // Verify access without starting a turn or reading credentials.
      await client.rpc('account/rateLimits/read', { excludeResetCreditDetails: true })
    }
    return readiness
  } catch (error) {
    // Account RPCs wrap HTTP failures in JSON-RPC errors, often with code -32603.
    if (
      error instanceof CodexRpcError &&
      (error.code === 401 ||
        /\b401\b|\bunauthorized\b|authentication required|please (?:log out and sign|sign) in again/i.test(
          error.message
        ))
    ) {
      return CODEX_LOGIN_REQUIRED
    }
    throw error
  }
}

export async function startCodexLogin(): Promise<HarnessLoginAttempt> {
  const client = await getCodexClient()
  const cloud = getAppConfig().environment === 'cloud'
  const login = await client.rpc<CodexLoginResponse>(
    'account/login/start',
    cloud
      ? { type: 'chatgptDeviceCode' }
      : {
          type: 'chatgpt',
          useHostedLoginSuccessPage: true,
          appBrand: 'codex'
        }
  )
  const url = cloud ? login.verificationUrl : login.authUrl
  if (!login.loginId || !url || (cloud && !login.userCode) || new URL(url).protocol !== 'https:') {
    if (login.loginId) await client.rpc('account/login/cancel', { loginId: login.loginId })
    throw new Error(
      'ChatGPT did not return valid sign-in instructions. Update ChatGPT and try again'
    )
  }
  let unsubscribe = () => {}
  const completed = new Promise<void>((resolve, reject) => {
    unsubscribe = client.onNotification((method, params) => {
      if (
        method !== 'account/login/completed' ||
        !isRecord(params) ||
        params.loginId !== login.loginId
      )
        return
      unsubscribe()
      if (params.success === true) resolve()
      else reject(new Error('ChatGPT sign-in failed or expired. Try again'))
    })
  })
  if (!cloud) void openBrowser(url)
  return {
    id: login.loginId,
    url,
    ...(cloud ? { userCode: login.userCode } : {}),
    completed,
    cancel: async () => {
      unsubscribe()
      await client.rpc('account/login/cancel', { loginId: login.loginId })
    }
  }
}
