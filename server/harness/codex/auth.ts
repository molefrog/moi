import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { getCodexClient } from './client'

export type CodexAccountResponse = {
  account: unknown | null
  requiresOpenaiAuth: boolean
}

type CodexLoginResponse = { type: string; authUrl?: string }

function needsCodexLogin(reason: string): HarnessAvailability {
  return {
    available: false,
    reason,
    loginCommand: 'codex login'
  }
}

export function codexAccountReadiness(response: CodexAccountResponse): HarnessAvailability {
  // Non-OpenAI model providers can run without a Codex account. For OpenAI,
  // an account object is the app-server's authoritative logged-in signal.
  if (!response.requiresOpenaiAuth || response.account) return { available: true }
  return needsCodexLogin('Codex is signed out. Sign in to send messages')
}

export async function getCodexAuthReadiness(workspacePath: string): Promise<HarnessAvailability> {
  try {
    const client = await getCodexClient(workspacePath)
    const account = await client.rpc<CodexAccountResponse>('account/read', { refreshToken: true })
    return codexAccountReadiness(account)
  } catch {
    return needsCodexLogin('Could not verify the Codex login')
  }
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
