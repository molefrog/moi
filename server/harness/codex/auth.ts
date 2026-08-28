import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { CODEX_MIN_SUPPORTED_VERSION, codexCliOutdated, getCodexClient } from './client'

type CodexAccount = { type: string }
type CodexAccountReadResponse = {
  account: CodexAccount | null
  requiresOpenaiAuth: boolean
}
type CodexLoginResponse = { type: string; authUrl?: string }

const CODEX_AVAILABLE: HarnessAvailability = { status: 'available' }
const CODEX_LOGIN_REQUIRED: HarnessAvailability = {
  status: 'login-required',
  reason: 'Codex is signed out. Sign in to send messages'
}
const CODEX_AUTH_UNAVAILABLE: HarnessAvailability = {
  status: 'unavailable',
  reason: 'Could not check the Codex login status'
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

// Servers older than the supported floor reject every method moi calls with a
// bare "Invalid request", which the probe would surface as a generic failure —
// report the actionable cause instead.
export function codexOutdatedAvailability(
  cliVersion: string | undefined
): HarnessAvailability | undefined {
  if (!codexCliOutdated(cliVersion)) return undefined
  return {
    status: 'unavailable',
    reason: `Codex ${cliVersion} is out of date. Update Codex to ${CODEX_MIN_SUPPORTED_VERSION} or newer`
  }
}

export async function getCodexAuthReadiness(workspacePath: string): Promise<HarnessAvailability> {
  const client = await getCodexClient(workspacePath)
  const outdated = codexOutdatedAvailability(client.cliVersion)
  if (outdated) return outdated
  const account = await client.rpc<unknown>('account/read', { refreshToken: true })
  return codexAccountReadiness(account)
}

export async function startCodexLogin(workspacePath: string): Promise<HarnessLogin> {
  const client = await getCodexClient(workspacePath)
  const login = await client.rpc<CodexLoginResponse>('account/login/start', {
    type: 'chatgpt',
    useHostedLoginSuccessPage: true,
    appBrand: 'codex'
  })
  if (login.type !== 'chatgpt' || !login.authUrl) {
    throw new Error('Codex did not return a browser login URL')
  }
  const url = new URL(login.authUrl)
  if (url.protocol !== 'https:') throw new Error('Codex returned an unsafe login URL')
  return { url: url.toString() }
}
