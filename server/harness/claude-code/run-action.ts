import { query, type Query } from '@anthropic-ai/claude-agent-sdk'
import { claudeCodeSpawn } from '../../agent-launcher'
import type { HarnessActionInput } from '../types'
import { requireHarnessExecutable } from '../executable'
import {
  type ActionExecution,
  actionProgressServerName,
  actionProgressToolName,
  executeHarnessAction
} from '../run-action'
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

async function claudeAction(input: ActionExecution): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  input.signal.addEventListener('abort', abort, { once: true })
  if (input.signal.aborted) controller.abort()
  let run: Query | undefined
  try {
    run = query({
      prompt: input.prompt,
      options: {
        cwd: input.cwd,
        abortController: controller,
        persistSession: false,
        maxTurns: 24,
        pathToClaudeCodeExecutable: requireHarnessExecutable('claude-code'),
        spawnClaudeCodeProcess: claudeCodeSpawn(),
        settingSources: [],
        env: { ...process.env, CLAUDECODE: undefined },
        outputFormat: { type: 'json_schema', schema: input.resultSchema },
        mcpServers: input.progressUrl
          ? {
              [actionProgressServerName]: { type: 'http', url: input.progressUrl, alwaysLoad: true }
            }
          : undefined,
        permissionMode: 'default',
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async event => {
                  if (event.hook_event_name !== 'PreToolUse') return {}
                  let allowed =
                    canReadTool(event.tool_name) ||
                    (!!input.progressUrl &&
                      event.tool_name ===
                        `mcp__${actionProgressServerName}__${actionProgressToolName}`)
                  if (!allowed && event.mcp_server && run) {
                    const servers = await run.mcpServerStatus()
                    const server = servers.find(server => server.name === event.mcp_server?.name)
                    const toolName = event.tool_name.split('__').slice(2).join('__')
                    allowed =
                      server?.tools?.some(
                        tool =>
                          tool.name === toolName && canReadTool(event.tool_name, tool.annotations)
                      ) ?? false
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
      if (message.type === 'result' && message.subtype === 'success' && !message.is_error)
        return message.structured_output
      if (message.type === 'result')
        throw new Error(
          message.subtype === 'success' ? message.result : 'The agent could not complete the action'
        )
    }
    throw new Error('The agent returned no structured output')
  } finally {
    input.signal.removeEventListener('abort', abort)
    run?.close()
  }
}

export async function runClaudeAction<TResult, TProgress = never>(
  input: HarnessActionInput<TResult, TProgress>
): Promise<TResult> {
  return executeHarnessAction(input, claudeAction)
}
