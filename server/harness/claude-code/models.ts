import { query } from '@anthropic-ai/claude-agent-sdk'
import type { ModelInfo } from '@anthropic-ai/claude-agent-sdk'

import { requireHarnessExecutable } from '../executable'

// Chat runs live in `cc-session.ts` (streaming-input sessions held per thread).
// MCP status probing lives in `mcp.ts`. This module now only probes the agent
// backend for the model list — spins up a throwaway `query()` and reads metadata.

// Claude's available models come from the account/CLI, not the workspace, so
// the list is identical everywhere. We still need a `cwd` to spin up a probe
// query, but cache the result process-wide.
async function fetchClaudeModels(cwd: string): Promise<ModelInfo[]> {
  const q = query({
    prompt: '',
    options: {
      cwd,
      pathToClaudeCodeExecutable: requireHarnessExecutable('claude-code'),
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
