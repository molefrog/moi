import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { createHarnessTempDir, removeHarnessTempDir } from './command'
import type { ActionModel, HarnessActionInput } from './types'

export const actionProgressServerName = 'moi_action'
export const actionProgressToolName = 'report_progress'

export type ActionExecution = {
  prompt: string
  model: ActionModel
  resultSchema: Record<string, unknown>
  signal: AbortSignal
  cwd: string
  progressUrl?: string
}

function serveProgress<T>(schema: z.ZodType<T>, report: (value: T) => void | Promise<void>) {
  const path = `/${crypto.randomUUID()}`
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== path || request.headers.has('origin'))
        return new Response('Not found', { status: 404 })
      const mcp = new McpServer({ name: actionProgressServerName, version: '1.0.0' })
      mcp.registerTool(
        actionProgressToolName,
        {
          description: 'Report current action progress using the supplied schema',
          inputSchema: { progress: schema },
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
        },
        async ({ progress }) => {
          await report(progress)
          return { content: [{ type: 'text', text: 'Progress reported' }] }
        }
      )
      const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
      await mcp.connect(transport)
      try {
        return await transport.handleRequest(request)
      } finally {
        await mcp.close()
      }
    }
  })
  return { url: `http://127.0.0.1:${server.port}${path}`, close: () => server.stop(true) }
}

export async function executeHarnessAction<TResult, TProgress>(
  input: HarnessActionInput<TResult, TProgress>,
  execute: (action: ActionExecution) => Promise<unknown>
): Promise<TResult> {
  if (input.signal.aborted) throw new Error('Action cancelled')
  const cwd = await createHarnessTempDir()
  let progress: ReturnType<typeof serveProgress> | undefined
  const stop = () => {
    void progress?.close()
  }
  try {
    if (input.signal.aborted) throw new Error('Action cancelled')
    if (input.progressSchema) progress = serveProgress(input.progressSchema, input.onProgress)
    input.signal.addEventListener('abort', stop, { once: true })
    const result = await execute({
      model: input.model ?? 'normal',
      prompt:
        input.prompt +
        (progress
          ? `\n\nUse ${actionProgressServerName}/${actionProgressToolName} to report brief progress when your activity changes. Report only work you are actually doing. Return the final result through the result schema.`
          : ''),
      resultSchema: z.toJSONSchema(input.resultSchema, { target: 'draft-7' }),
      signal: input.signal,
      cwd,
      progressUrl: progress?.url
    })
    if (input.signal.aborted) throw new Error('Action cancelled')
    return input.resultSchema.parse(result)
  } finally {
    input.signal.removeEventListener('abort', stop)
    await progress?.close()
    await removeHarnessTempDir(cwd).catch(() => {})
  }
}
