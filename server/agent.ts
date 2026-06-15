import { query } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerStatus, ModelInfo } from '@anthropic-ai/claude-agent-sdk'

// Chat runs live in `cc-session.ts` (streaming-input sessions held per thread).
// This module now only probes the agent backend for MCP status and the model
// list — both spin up a throwaway `query()` and read metadata.

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
