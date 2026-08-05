import type { HarnessAvailability, HarnessLoginFlow } from '@/lib/types'

import { getCodexClient } from './client'

export const CODEX_LOGIN_COMMAND = 'codex login'

type CodexAccount =
  | { type: 'apiKey' }
  | { type: 'chatgpt'; email: string | null; planType: string }
  | { type: 'amazonBedrock'; usesCodexManagedCredentials: boolean }

export type CodexAccountResponse = {
  account: CodexAccount | null
  requiresOpenaiAuth: boolean
}

type CodexLoginResponse = { type: 'chatgpt'; loginId: string; authUrl: string } | { type: string }

function needsCodexLogin(reason: string): HarnessAvailability {
  return {
    available: false,
    reason,
    recovery: {
      kind: 'login',
      command: CODEX_LOGIN_COMMAND,
      inApp: true
    }
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

export async function startCodexLogin(workspacePath: string): Promise<HarnessLoginFlow> {
  const client = await getCodexClient(workspacePath)
  const login = await client.rpc<CodexLoginResponse>('account/login/start', {
    type: 'chatgpt',
    useHostedLoginSuccessPage: true,
    appBrand: 'codex'
  })
  if (login.type !== 'chatgpt' || !('authUrl' in login)) {
    throw new Error('Codex did not return a browser login URL')
  }
  const url = new URL(login.authUrl)
  if (url.protocol !== 'https:') throw new Error('Codex returned an unsafe login URL')
  return { type: 'browser', url: url.toString() }
}
