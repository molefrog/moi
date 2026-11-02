import { query, type Query } from '@anthropic-ai/claude-agent-sdk'
import { claudeCodeSpawn } from '../../agent-launcher'
import { createHarnessTempDir, removeHarnessTempDir } from '../command'
import type { HarnessActionInput } from '../types'
import { requireHarnessExecutable } from '../executable'
const readTools = new Set([
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'ToolSearch',
  'ListMcpResources',
  'ReadMcpResource',
  'StructuredOutput'
])
export function canReadTool(
  name: string,
  annotations?: { readOnly?: boolean; destructive?: boolean }
) {
  return (
    readTools.has(name) ||
    (name.startsWith('mcp__') && annotations?.readOnly === true && annotations.destructive !== true)
  )
}

async function claudeAction(input: HarnessActionInput, cwd: string): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  input.signal.addEventListener('abort', abort, { once: true })
  if (input.signal.aborted) controller.abort()
  let run: Query | undefined
  try {
    run = query({
      prompt: input.prompt,
      options: {
        cwd,
        abortController: controller,
        persistSession: false,
        maxTurns: 24,
        pathToClaudeCodeExecutable: requireHarnessExecutable('claude-code'),
        spawnClaudeCodeProcess: claudeCodeSpawn(),
        settingSources: [],
        env: { ...process.env, CLAUDECODE: undefined },
        outputFormat: { type: 'json_schema', schema: input.schema },
        permissionMode: 'default',
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async event => {
                  if (event.hook_event_name !== 'PreToolUse') return {}
                  let allowed = canReadTool(event.tool_name)
                  if (!allowed && event.tool_name.startsWith('mcp__') && run) {
                    const servers = await run.mcpServerStatus()
                    allowed = servers.some(server =>
                      server.tools?.some(
                        tool =>
                          `mcp__${server.name}__${tool.name}` === event.tool_name &&
                          canReadTool(event.tool_name, tool.annotations)
                      )
                    )
                  }
                  return {
                    hookSpecificOutput: {
                      hookEventName: 'PreToolUse',
                      permissionDecision: allowed ? 'allow' : 'deny',
                      permissionDecisionReason: 'This action only permits read/search tools'
                    }
                  }
                }
              ]
            }
          ]
        },
        canUseTool: async () => ({
          behavior: 'deny',
          message: 'This action only permits approved read/search tools'
        })
      }
    })
    for await (const message of run) {
      if (message.type === 'result' && message.subtype === 'success')
        return message.structured_output
      if (message.type === 'result') throw new Error('The agent could not complete the action')
    }
    throw new Error('The agent returned no structured output')
  } finally {
    input.signal.removeEventListener('abort', abort)
    run?.close()
  }
}

export async function runClaudeAction(input: HarnessActionInput): Promise<unknown> {
  if (input.signal.aborted) throw new Error('Action cancelled')
  const cwd = await createHarnessTempDir()
  try {
    return await claudeAction(input, cwd)
  } finally {
    await removeHarnessTempDir(cwd).catch(() => {})
  }
}
