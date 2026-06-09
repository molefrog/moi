import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerStatus, ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import { ClaudeAdapter } from '@/lib/claude-adapter'

import { broadcast, getAgent, renameAgent } from './state'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export async function handleChat(
  content: string,
  sessionId: string,
  isNew: boolean,
  workspaceId: string,
  workspacePath: string,
  optimisticId?: string,
  // Model id from the picker (`supportedModels()` `value`). Applied per turn;
  // falls back to the default when omitted.
  model?: string
) {
  const agent = getAgent(sessionId)

  if (agent.processing) {
    broadcast(workspaceId, {
      kind: 'error',
      sessionId,
      content: 'Already processing a message'
    })
    return
  }

  const ctrl = new AbortController()
  agent.processing = true
  agent.abortController = ctrl
  broadcast(workspaceId, { type: 'status', sessionId, processing: true })

  let currentId = sessionId
  const adapter = new ClaudeAdapter()
  if (optimisticId) adapter.expectUserEcho(optimisticId, content)

  try {
    const options: Options = {
      abortController: ctrl,
      maxTurns: 50,
      cwd: workspacePath,
      // Omit entirely when unspecified so the SDK/CLI default model is used.
      ...(model ? { model } : {}),
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'MultiEdit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch'
      ],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['user', 'project'],
      env: { ...process.env, CLAUDECODE: undefined },
      stderr: (data: string) => console.error('[SDK stderr]', data)
    }

    if (!isNew) options.resume = sessionId

    const q = query({ prompt: content, options })

    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        const realId = msg.session_id
        if (isNew && realId !== currentId) {
          renameAgent(currentId, realId)
          broadcast(workspaceId, { type: 'session_renamed', from: currentId, to: realId })
          currentId = realId
        }
      }

      for (const ev of adapter.ingest(msg)) {
        broadcast(workspaceId, { ...ev, sessionId: currentId })
      }
    }
  } catch (err: unknown) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      broadcast(workspaceId, {
        kind: 'error',
        sessionId: currentId,
        content: getErrorMessage(err)
      })
    }
  } finally {
    const finalAgent = getAgent(currentId)
    finalAgent.processing = false
    finalAgent.abortController = null
    broadcast(workspaceId, { type: 'status', sessionId: currentId, processing: false })
  }
}

export function stopChat(sessionId: string, workspaceId: string) {
  const agent = getAgent(sessionId)
  if (agent.abortController) {
    agent.abortController.abort()
    broadcast(workspaceId, { kind: 'stopped', sessionId })
  }
}

// Per-workspace MCP cache
const mcpCache = new Map<string, McpServerStatus[]>()

async function fetchMcpStatus(workspacePath: string): Promise<McpServerStatus[]> {
  const q = query({
    prompt: '',
    options: {
      cwd: workspacePath,
      persistSession: false,
      settingSources: ['user', 'project'],
      env: { ...process.env, CLAUDECODE: undefined }
    }
  })
  const status = await q.mcpServerStatus()
  await q.close()
  console.log('[mcp]', status.map(s => `${s.name}:${s.status}`).join(', '))
  return status
}

export async function getMcpStatus(workspacePath: string): Promise<McpServerStatus[]> {
  const cached = mcpCache.get(workspacePath)
  if (cached) return cached
  const status = await fetchMcpStatus(workspacePath)
  mcpCache.set(workspacePath, status)
  return status
}

// Claude's available models come from the account/CLI, not the workspace, so
// the list is identical everywhere. We still need a `cwd` to spin up a probe
// query (mirrors fetchMcpStatus), but cache the result process-wide.
async function fetchClaudeModels(cwd: string): Promise<ModelInfo[]> {
  const q = query({
    prompt: '',
    options: {
      cwd,
      persistSession: false,
      settingSources: ['user', 'project'],
      env: { ...process.env, CLAUDECODE: undefined }
    }
  })
  const models = await q.supportedModels()
  await q.close()
  // Raw SDK shape, passed through to the client as-is.
  return models
}

// One in-flight/settled promise shared across all callers. On failure we clear
// it so a later request can retry instead of caching the rejection forever.
let claudeModelsPromise: Promise<ModelInfo[]> | null = null

export function getClaudeModels(cwd: string): Promise<ModelInfo[]> {
  if (!claudeModelsPromise) {
    claudeModelsPromise = fetchClaudeModels(cwd).catch(err => {
      claudeModelsPromise = null
      throw err
    })
  }
  return claudeModelsPromise
}
