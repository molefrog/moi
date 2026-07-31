import { join } from 'node:path'

import type { CodexThread } from './adapter'
import type { CodexClient } from './client'

import {
  SESSION_TITLE_SCHEMA,
  SESSION_TITLE_SYSTEM_PROMPT,
  SESSION_TITLE_TIMEOUT_MS,
  createSessionTitleTempDir,
  parseGeneratedSessionTitleJson,
  removeSessionTitleTempDir,
  runSessionTitleCommand
} from '../session-title'
import { requireHarnessExecutable } from '../executable'

const CODEX_SESSION_TITLE_MODEL = 'gpt-5.6-luna'

function codexSessionTitleEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('CODEX_') || key === 'CODEX_HOME' || key === 'CODEX_API_KEY'
    )
  )
}

export function parseCodexFeatureNames(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim().split(/\s+/u)[0])
    .filter((name): name is string => Boolean(name?.match(/^[a-z][a-z0-9_]*$/u)))
}

export function codexSessionTitleCommand(input: {
  executable: string
  cwd: string
  schemaPath: string
  outputPath: string
  features: readonly string[]
}): string[] {
  const disabledFeatures = input.features.flatMap(feature => ['--disable', feature])
  const config = [
    `developer_instructions=${JSON.stringify(SESSION_TITLE_SYSTEM_PROMPT)}`,
    'model_reasoning_effort="low"',
    'model_reasoning_summary="none"',
    'web_search="disabled"',
    'tools.experimental_request_user_input.enabled=false',
    'include_permissions_instructions=false',
    'include_apps_instructions=false',
    'include_collaboration_mode_instructions=false',
    'include_environment_context=false',
    'project_doc_max_bytes=0',
    'project_doc_fallback_filenames=[]',
    'skills.include_instructions=false',
    'skills.bundled.enabled=false',
    'orchestrator.skills.enabled=false',
    'orchestrator.mcp.enabled=false',
    'notify=[]'
  ].flatMap(value => ['-c', value])

  return [
    input.executable,
    'exec',
    '--model',
    CODEX_SESSION_TITLE_MODEL,
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--strict-config',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--cd',
    input.cwd,
    '--output-schema',
    input.schemaPath,
    '--output-last-message',
    input.outputPath,
    '--color',
    'never',
    ...disabledFeatures,
    ...config,
    '-'
  ]
}

export async function generateCodexSessionTitle(input: {
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
    const executable = requireHarnessExecutable('codex')
    const env = codexSessionTitleEnv()
    const featureOutput = await runSessionTitleCommand({
      command: [executable, 'features', 'list'],
      cwd: tempDir,
      signal: input.abortController.signal,
      env
    })
    const features = featureOutput ? parseCodexFeatureNames(featureOutput) : []
    if (features.length === 0) return null

    const schemaPath = join(tempDir, 'schema.json')
    const outputPath = join(tempDir, 'result.json')
    await Bun.write(schemaPath, JSON.stringify(SESSION_TITLE_SCHEMA))
    const output = await runSessionTitleCommand({
      command: codexSessionTitleCommand({
        executable,
        cwd: tempDir,
        schemaPath,
        outputPath,
        features
      }),
      cwd: tempDir,
      stdin: JSON.stringify({ sessionTitleSource: input.source }),
      signal: input.abortController.signal,
      env
    })
    if (output === null) return null
    return parseGeneratedSessionTitleJson(await Bun.file(outputPath).text())
  } finally {
    clearTimeout(timer)
    if (tempDir) await removeSessionTitleTempDir(tempDir).catch(() => {})
  }
}

export async function renameCodexSessionIfUnchanged(input: {
  client: Pick<CodexClient, 'rpc'>
  threadId: string
  title: string
  isCurrent: () => boolean
}): Promise<boolean> {
  if (!input.isCurrent()) return false
  const response = await input.client.rpc<{ thread?: CodexThread }>('thread/read', {
    threadId: input.threadId,
    includeTurns: false
  })
  if (!response.thread || response.thread.name?.trim() || !input.isCurrent()) return false
  await input.client.rpc('thread/name/set', { threadId: input.threadId, name: input.title })
  return true
}
