import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { resolveWorkspaceEnv } from '../../workspace-env'
import { findHarnessExecutable } from '../executable'

function signedOut(reason: string): HarnessAvailability {
  return {
    available: false,
    reason,
    loginCommand: 'claude auth login'
  }
}

// Claude Code 2.1.42+ exposes a stable JSON auth probe. Run it with the same
// workspace env as the actual Agent SDK subprocess so API-key and enterprise
// provider configuration are evaluated consistently with the eventual send.
export async function getClaudeAuthReadiness(workspacePath: string): Promise<HarnessAvailability> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable) return signedOut('Claude is not installed')

  try {
    const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
    const proc = Bun.spawn([executable, 'auth', 'status'], {
      cwd: workspacePath,
      env: { ...process.env, ...workspaceEnv },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore'
    })
    const timeout = setTimeout(() => proc.kill(), 5_000)
    const exitCode = await proc.exited
    clearTimeout(timeout)
    return exitCode === 0
      ? { available: true }
      : signedOut('Claude is signed out. Sign in to send messages')
  } catch {
    return signedOut('Could not verify the Claude login')
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
