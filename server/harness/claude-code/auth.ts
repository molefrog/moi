import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { resolveWorkspaceEnv } from '../../workspace-env'
import { findHarnessExecutable } from '../executable'

function signedOut(reason: string): HarnessAvailability {
  return { status: 'login-required', reason }
}

function unavailable(reason: string): HarnessAvailability {
  return { status: 'unavailable', reason }
}

type ClaudeAuthProbeResult = {
  exitCode: number
  stdout: string
  timedOut: boolean
}

const CLAUDE_AUTH_UNAVAILABLE = 'Could not check the Claude login status'

export function claudeAuthReadiness(result: ClaudeAuthProbeResult): HarnessAvailability {
  if (result.timedOut) return unavailable(CLAUDE_AUTH_UNAVAILABLE)

  let response: unknown
  try {
    response = JSON.parse(result.stdout)
  } catch {
    return unavailable(CLAUDE_AUTH_UNAVAILABLE)
  }

  if (!response || typeof response !== 'object' || !('loggedIn' in response)) {
    return unavailable(CLAUDE_AUTH_UNAVAILABLE)
  }
  if (response.loggedIn === false) {
    return signedOut('Claude is signed out. Sign in to send messages')
  }
  if (response.loggedIn === true && result.exitCode === 0) return { status: 'available' }
  return unavailable(CLAUDE_AUTH_UNAVAILABLE)
}

// Claude Code 2.1.42+ exposes a stable JSON auth probe. Run it with the same
// workspace env as the actual Agent SDK subprocess so API-key and enterprise
// provider configuration are evaluated consistently with the eventual send.
export async function getClaudeAuthReadiness(workspacePath: string): Promise<HarnessAvailability> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable) return unavailable('Claude is not installed')

  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const proc = Bun.spawn([executable, 'auth', 'status', '--json'], {
    cwd: workspacePath,
    env: { ...process.env, ...workspaceEnv },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore'
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, 5_000)
  try {
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      Bun.readableStreamToText(proc.stdout)
    ])
    return claudeAuthReadiness({ exitCode, stdout, timedOut })
  } finally {
    clearTimeout(timeout)
  }
}

export async function startClaudeLogin(workspacePath: string): Promise<HarnessLogin> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable) throw new Error('Claude is not installed')

  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  Bun.spawn([executable, 'auth', 'login'], {
    cwd: workspacePath,
    env: { ...process.env, ...workspaceEnv },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  }).unref()
  return {}
}
