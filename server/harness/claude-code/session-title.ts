import { getSessionInfo, renameSession, type SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk'

import {
  SESSION_TITLE_SCHEMA,
  SESSION_TITLE_SYSTEM_PROMPT,
  SESSION_TITLE_TIMEOUT_MS,
  createSessionTitleTempDir,
  parseGeneratedSessionTitle,
  removeSessionTitleTempDir,
  runSessionTitleCommand
} from '../session-title'
import { requireHarnessExecutable } from '../executable'

export function claudeSessionTitleCommand(executable: string): string[] {
  return [
    executable,
    '-p',
    '--model',
    'haiku',
    '--effort',
    'low',
    '--max-turns',
    '1',
    '--tools',
    '',
    '--safe-mode',
    '--no-session-persistence',
    '--disable-slash-commands',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--permission-mode',
    'dontAsk',
    '--system-prompt',
    SESSION_TITLE_SYSTEM_PROMPT,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(SESSION_TITLE_SCHEMA)
  ]
}

export function parseClaudeSessionTitleOutput(value: string): string | null {
  try {
    const result = JSON.parse(value) as { structured_output?: unknown }
    return parseGeneratedSessionTitle(result.structured_output)
  } catch {
    return null
  }
}

export async function generateClaudeSessionTitle(input: {
  source: string
  abortController: AbortController
  timeoutMs?: number
}): Promise<string | null> {
  if (!input.source || input.abortController.signal.aborted) return null
  const timer = setTimeout(
    () => input.abortController.abort(),
    input.timeoutMs ?? SESSION_TITLE_TIMEOUT_MS
  )
  let tempDir: string | undefined
  try {
    tempDir = await createSessionTitleTempDir()
    const output = await runSessionTitleCommand({
      command: claudeSessionTitleCommand(requireHarnessExecutable('claude-code')),
      cwd: tempDir,
      stdin: JSON.stringify({ sessionTitleSource: input.source }),
      signal: input.abortController.signal,
      env: { ...process.env, CLAUDECODE: undefined, DISABLE_AUTOUPDATER: '1' }
    })
    return output ? parseClaudeSessionTitleOutput(output) : null
  } finally {
    clearTimeout(timer)
    if (tempDir) await removeSessionTitleTempDir(tempDir).catch(() => {})
  }
}

type ClaudeSessionTitleRenameTransport = {
  getSessionInfo: (sessionId: string, workspacePath: string) => Promise<SDKSessionInfo | undefined>
  renameSession: (sessionId: string, title: string, workspacePath: string) => Promise<void>
}

const defaultSessionTitleRenameTransport: ClaudeSessionTitleRenameTransport = {
  getSessionInfo: (sessionId, workspacePath) => getSessionInfo(sessionId, { dir: workspacePath }),
  renameSession: (sessionId, title, workspacePath) =>
    renameSession(sessionId, title, { dir: workspacePath })
}

export async function renameClaudeSessionIfUnchanged(
  input: {
    sessionId: string
    workspacePath: string
    title: string
    isCurrent?: () => boolean
  },
  transport: ClaudeSessionTitleRenameTransport = defaultSessionTitleRenameTransport
): Promise<boolean> {
  const info = await transport.getSessionInfo(input.sessionId, input.workspacePath)
  if (!info || info.customTitle || !info.firstPrompt || info.summary !== info.firstPrompt) {
    return false
  }
  if (input.isCurrent && !input.isCurrent()) return false
  await transport.renameSession(input.sessionId, input.title, input.workspacePath)
  return true
}
