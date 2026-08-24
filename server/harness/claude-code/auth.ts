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
  timedOut: boolean
}

const CLAUDE_AUTH_UNAVAILABLE = 'Could not check the Claude login status'

export function claudeAuthReadiness(result: ClaudeAuthProbeResult): HarnessAvailability {
  if (result.timedOut) return unavailable(CLAUDE_AUTH_UNAVAILABLE)
  if (result.exitCode === 0) return { status: 'available' }
  if (result.exitCode === 1) return signedOut('Claude is signed out. Sign in to send messages')
  return unavailable(CLAUDE_AUTH_UNAVAILABLE)
}

// Claude Code documents exit 0 as logged in and exit 1 as logged out. Run the
// probe with the same workspace env as the actual Agent SDK subprocess so
// API-key and enterprise provider configuration match the eventual send.
export async function getClaudeAuthReadiness(workspacePath: string): Promise<HarnessAvailability> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable) return unavailable('Claude is not installed')

  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const proc = Bun.spawn([executable, 'auth', 'status'], {
    cwd: workspacePath,
    env: { ...process.env, ...workspaceEnv },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore'
  })
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, 5_000)
  try {
    const exitCode = await proc.exited
    return claudeAuthReadiness({ exitCode, timedOut })
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
