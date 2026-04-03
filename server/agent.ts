import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk'
import * as path from 'path'

import {
  abortController,
  broadcast,
  processing,
  record,
  sessionId,
  setAbortController,
  setCwd,
  setProcessing,
  setSessionId,
  transformMessage
} from './state'

const WORKSPACE = path.join(import.meta.dir, '..', 'workspace')

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export async function handleChat(content: string) {
  if (processing) {
    broadcast({ type: 'error', content: 'Already processing a message' })
    return
  }

  setProcessing(true)
  setAbortController(new AbortController())
  broadcast({ type: 'status', processing: true })
  record({ type: 'user', content })

  try {
    const options: Options = {
      abortController: abortController!,
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

    if (sessionId) {
      options.resume = sessionId
    }

    const q = query({ prompt: content, options })

    for await (const msg of q) {
      // Capture session ID
      if (msg.type === 'system' && msg.subtype === 'init') {
        setSessionId(msg.session_id)
        setCwd(msg.cwd)

        // this was insanely slow, todo: figure out a better way to get up to date mcp status
        // q.mcpServerStatus().then(s => {
        //   mcpCache = s
        //   console.log('[mcp]', s.map(m => `${m.name}:${m.status}`).join(', '))
        // }).catch(() => {})
      }

      if (msg.type === 'assistant' || msg.type === 'user') {
        for (const m of transformMessage(msg)) record(m)
      }

      // Final result
      if (msg.type === 'result') {
        record({
          type: 'done',
          cost: msg.total_cost_usd,
          turns: msg.num_turns,
          session_id: msg.session_id
        })
      }
    }
  } catch (err: unknown) {
    // Don't record abort as an error
    if (!(err instanceof Error && err.name === 'AbortError')) {
      record({ type: 'error', content: getErrorMessage(err) })
    }
  } finally {
    setProcessing(false)
    setAbortController(null)
    broadcast({ type: 'status', processing: false })
  }
}

export function stopChat() {
  if (abortController) {
    abortController.abort()
    record({ type: 'stopped' })
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
