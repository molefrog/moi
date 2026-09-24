import type { HarnessAvailability, HarnessLogin } from '@/lib/types'

import { resolveWorkspaceEnv } from '../../workspace-env'
import { findHarnessExecutable } from '../executable'
import { claudeSpawnEnv } from './spawn-env'

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

// Both auth spawns used to discard stderr, which hid the one failure that
// matters most: Claude Code refusing to launch nested. Surface it the way the
// session subprocess surfaces its own stderr.
async function logAuthStderr(label: string, stream: ReadableStream<Uint8Array>): Promise<void> {
  const text = (await Bun.readableStreamToText(stream)).trim()
  if (text) console.error(`[claude ${label} stderr]`, text)
}

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
    env: claudeSpawnEnv(workspaceEnv),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe'
  })
  const stderrLogged = logAuthStderr('auth status', proc.stderr)
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    proc.kill()
  }, 5_000)
  try {
    const exitCode = await proc.exited
    await stderrLogged
    return claudeAuthReadiness({ exitCode, timedOut })
  } finally {
    clearTimeout(timeout)
  }
}

export async function startClaudeLogin(workspacePath: string): Promise<HarnessLogin> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable) throw new Error('Claude is not installed')

  const workspaceEnv = await resolveWorkspaceEnv(workspacePath)
  const proc = Bun.spawn([executable, 'auth', 'login'], {
    cwd: workspacePath,
    env: claudeSpawnEnv(workspaceEnv),
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe'
  })
  void logAuthStderr('auth login', proc.stderr)
  proc.unref()
  return {}
}
