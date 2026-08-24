import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { getCodexClient } from './client'

type CodexLoginResponse = { type: string; authUrl?: string }

function needsCodexLogin(reason: string): HarnessAvailability {
  return { status: 'login-required', reason }
}

function unavailable(reason: string): HarnessAvailability {
  return { status: 'unavailable', reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const CODEX_AUTH_UNAVAILABLE = 'Could not check the Codex login status'

export function codexAccountReadiness(response: unknown): HarnessAvailability {
  if (
    !isRecord(response) ||
    typeof response.requiresOpenaiAuth !== 'boolean' ||
    !('account' in response) ||
    (response.account !== null && !isRecord(response.account))
  ) {
    return unavailable(CODEX_AUTH_UNAVAILABLE)
  }

  // Non-OpenAI model providers can run without a Codex account. For OpenAI,
  // an account object is the app-server's authoritative logged-in signal.
  if (!response.requiresOpenaiAuth || response.account !== null) return { status: 'available' }
  return needsCodexLogin('Codex is signed out. Sign in to send messages')
}

export async function getCodexAuthReadiness(workspacePath: string): Promise<HarnessAvailability> {
  const client = await getCodexClient(workspacePath)
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
