import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import * as path from 'path'

import {
  abortController,
  broadcast,
  processing,
  record,
  saveState,
  sessionId,
  setAbortController,
  setProcessing,
  setSessionId
} from './state'

const WORKSPACE = path.join(import.meta.dir, 'workspace')

type TextContentBlock = {
  type: 'text'
  text: string
}

function isTextContentBlock(block: unknown): block is TextContentBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    block.type === 'text' &&
    'text' in block &&
    typeof block.text === 'string'
  )
}

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
      settingSources: ['project'],
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
        saveState()
      }

      // Assistant message — extract text and tool_use blocks
      if (msg.type === 'assistant' && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            record({ type: 'assistant', content: block.text })
          }
          if (block.type === 'tool_use') {
            record({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>
            })
          }
        }
      }

      // Tool results
      if (msg.type === 'user' && msg.message) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result') {
            const text =
              typeof block.content === 'string'
                ? block.content
                : Array.isArray(block.content)
                  ? block.content
                      .filter(isTextContentBlock)
                      .map((c: TextContentBlock) => c.text)
                      .join('\n')
                  : ''
            const cleaned = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
            record({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: cleaned.slice(0, 2000),
              is_error: !!block.is_error
            })
          }
        }
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
