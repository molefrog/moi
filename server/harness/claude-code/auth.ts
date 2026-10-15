import { stripVTControlCharacters } from 'node:util'
import { getAppConfig } from '../../app-config'
import type { HarnessLoginAttempt } from '../types'
import { homedir } from 'node:os'
import type { HarnessAvailability } from '@/lib/types'

import { agentCommand } from '../../agent-launcher'
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
export async function getClaudeAuthReadiness(workspacePath?: string): Promise<HarnessAvailability> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable)
    return { status: 'unavailable', code: 'not-installed', reason: 'Claude is not installed' }

  const workspaceEnv = workspacePath ? await resolveWorkspaceEnv(workspacePath) : {}
  const proc = Bun.spawn(agentCommand([executable, 'auth', 'status']), {
    cwd: workspacePath ?? homedir(),
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

// The printed link is the CLI's manual-code fallback. Local login also opens
// its callback URL automatically; cloud suppresses that server-side browser.
export function claudeLoginUrl(output: string): string | undefined {
  const text = stripVTControlCharacters(output)
  return text.match(/https:\/\/[^\s]+(?=\s)/g)?.find(value => {
    try {
      const url = new URL(value)
      return url.searchParams.get('response_type') === 'code' && url.searchParams.has('state')
    } catch {
      return false
    }
  })
}

export async function startClaudeLogin(): Promise<HarnessLoginAttempt> {
  const executable = findHarnessExecutable('claude-code')
  if (!executable) throw new Error('Claude Code is not installed')
  const proc = Bun.spawn(agentCommand([executable, 'auth', 'login']), {
    cwd: homedir(),
    env: { ...process.env, ...(getAppConfig().environment === 'cloud' ? { BROWSER: 'true' } : {}) },
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'ignore'
  })
  const completed = proc.exited.then(code => {
    if (code !== 0) throw new Error('Claude Code sign-in failed or expired. Try again')
  })
  // The process can fail before its URL is available.
  void completed.catch(() => {})
  const timeout = setTimeout(() => proc.kill(), 30_000)
  try {
    let output = ''
    const decoder = new TextDecoder()
    const reader = proc.stdout.getReader()
    let url: string | undefined
    while (!url) {
      const chunk = await reader.read()
      if (chunk.done)
        throw new Error(
          'Claude Code did not return a sign-in link. Update Claude Code and try again'
        )
      output += decoder.decode(chunk.value, { stream: true })
      if (output.length > 65_536) throw new Error('Could not read the Claude Code sign-in link')
      url = claudeLoginUrl(output)
    }
    reader.releaseLock()
    // Drain subsequent CLI output without storing authorization codes or tokens.
    void proc.stdout.pipeTo(new WritableStream({ write() {} })).catch(() => {})
    const state = new URL(url).searchParams.get('state')
    return {
      id: crypto.randomUUID(),
      url,
      acceptsCode: true,
      completed,
      cancel: () => {
        proc.kill()
      },
      submitCode: async code => {
        const parts = code.trim().split('#')
        if (parts.length !== 2 || !parts[0] || parts[1] !== state || /\s/.test(code.trim())) {
          throw new Error('Copy the full code from this sign-in attempt and try again')
        }
        if (proc.exitCode !== null) throw new Error('Sign-in expired. Start again')
        proc.stdin.write(code.trim() + '\n')
        await proc.stdin.flush()
      }
    }
  } catch (error) {
    proc.kill()
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
