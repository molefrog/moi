import type { Tool } from '@/lib/tools'

type NativeContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void> | void
}

function modelContext(): NativeContext | undefined {
  return typeof document === 'undefined'
    ? undefined
    : (document as Document & { modelContext?: NativeContext }).modelContext
}

export function hasWebMcp(): boolean {
  return typeof modelContext()?.registerTool === 'function'
}

export function registerWebMcpTool(tool: Tool, report: (message: string) => void): () => void {
  const lifetime = new AbortController()
  const context = modelContext()
  if (context?.registerTool) {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifetime.signal })).catch(error => {
        if (!lifetime.signal.aborted) report(`WebMCP registration failed: ${String(error)}`)
      })
    } catch (error) {
      report(`WebMCP registration failed: ${String(error)}`)
    }
  }
  return () => lifetime.abort()
}
