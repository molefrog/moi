import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk'
import * as path from 'path'

import { broadcast, getAgent, renameAgent, transformMessage } from './state'

const WORKSPACE = path.join(import.meta.dir, '..', 'workspace')

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export async function handleChat(content: string, sessionId: string, isNew: boolean) {
  const agent = getAgent(sessionId)

  if (agent.processing) {
    broadcast({ type: 'error', sessionId, content: 'Already processing a message' })
    return
  }

  const ctrl = new AbortController()
  agent.processing = true
  agent.abortController = ctrl
  broadcast({ type: 'status', sessionId, processing: true })
  broadcast({ type: 'user', sessionId, content })

  // currentId gets updated after system/init for new sessions
  let currentId = sessionId

  try {
    const options: Options = {
      abortController: ctrl,
      maxTurns: 50,
      cwd: WORKSPACE,
      model: 'sonnet',
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

        // New session: migrate agent state from temp ID to real ID
        if (isNew && realId !== currentId) {
          renameAgent(currentId, realId)
          broadcast({ type: 'session_renamed', from: currentId, to: realId })
          currentId = realId
        }
      }

      if (msg.type === 'assistant' || msg.type === 'user') {
        for (const m of transformMessage(msg)) {
          broadcast({ ...m, sessionId: currentId })
        }
      }

      if (msg.type === 'result') {
        broadcast({
          type: 'done',
          sessionId: currentId,
          cost: msg.total_cost_usd,
          turns: msg.num_turns,
          session_id: msg.session_id
        })
      }
    }
  } catch (err: unknown) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      broadcast({ type: 'error', sessionId: currentId, content: getErrorMessage(err) })
    }
  } finally {
    // Look up by currentId (may have been renamed)
    const finalAgent = getAgent(currentId)
    finalAgent.processing = false
    finalAgent.abortController = null
    broadcast({ type: 'status', sessionId: currentId, processing: false })
  }
}

export function stopChat(sessionId: string) {
  const agent = getAgent(sessionId)
  if (agent.abortController) {
    agent.abortController.abort()
    broadcast({ type: 'stopped', sessionId })
  }
}

let mcpCache: McpServerStatus[] | null = null

async function fetchMcpStatus(): Promise<McpServerStatus[]> {
  const q = query({
    prompt: '',
    options: {
      cwd: WORKSPACE,
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

export async function getMcpStatus(): Promise<McpServerStatus[]> {
  if (!mcpCache) mcpCache = await fetchMcpStatus()
  return mcpCache
}
