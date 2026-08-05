import type { HarnessAvailability } from '@/lib/types'

import { resolveWorkspaceEnv } from '../../workspace-env'
import { findHarnessExecutable } from '../executable'

export const CLAUDE_LOGIN_COMMAND = 'claude auth login'

type ClaudeAuthStatus = {
  loggedIn?: unknown
}

export function parseClaudeAuthStatus(stdout: string): boolean | null {
  try {
    const status = JSON.parse(stdout) as ClaudeAuthStatus
    return typeof status.loggedIn === 'boolean' ? status.loggedIn : null
  } catch {
    return null
  }
}

function signedOut(reason: string): HarnessAvailability {
  return {
    available: false,
    reason,
    recovery: {
      kind: 'login',
      command: CLAUDE_LOGIN_COMMAND,
      inApp: false
    }
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
      stdout: 'pipe',
      stderr: 'pipe'
    })
    const timeout = setTimeout(() => proc.kill(), 5_000)
    const [exitCode, stdout] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text()
    ])
    clearTimeout(timeout)

    const loggedIn = parseClaudeAuthStatus(stdout)
    if (loggedIn === true) return { available: true }
    if (loggedIn === false) {
      return signedOut('Claude is signed out. Sign in to send messages')
    }

    // Older CLIs may not support the JSON probe. A successful exit still
    // means the provider considers its credentials usable.
    if (exitCode === 0) return { available: true }
    return signedOut('Could not verify the Claude login')
  } catch {
    return signedOut('Could not verify the Claude login')
  }
}
