import { prepareTool } from '@/lib/tool-execution'
import type { JsonValue, Tool, ToolDescriptor } from '@/lib/tools'
import { registerWebMcpTool } from '@/client/runtime/webmcp'

type Entry = ReturnType<typeof prepareTool> & { workspaceId: string; viewId: string }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
const keyFor = (workspaceId: string, viewId: string, name: string) =>
  `${workspaceId}\0${viewId}\0${name}`
const changed = () => {
  for (const listener of listeners) listener()
}

export function onViewToolsChanged(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function listViewTools(workspaceId: string, viewId: string): ToolDescriptor[] {
  return [...entries.values()]
    .filter(entry => entry.workspaceId === workspaceId && entry.viewId === viewId)
    .map(entry => entry.descriptor)
}

export function registerViewTool(
  workspaceId: string,
  viewId: string,
  tool: Tool,
  report: (message: string) => void
): () => void {
  const key = keyFor(workspaceId, viewId, tool.name)
  if (entries.has(key)) throw new Error(`Duplicate tool "${tool.name}" for view:${viewId}.`)
  const prepared = prepareTool(tool)
  const lifetime = new AbortController()
  const entry: Entry = {
    workspaceId,
    viewId,
    descriptor: prepared.descriptor,
    call: (args, signal) => prepared.call(args, AbortSignal.any([signal, lifetime.signal]))
  }
  entries.set(key, entry)
  changed()
  const unregisterWebMcp = registerWebMcpTool(
    {
      ...prepared.descriptor,
      execute: (args, options) => entry.call(args, options?.signal ?? lifetime.signal)
    },
    report
  )
  return () => {
    if (entries.get(key) === entry) {
      entries.delete(key)
      changed()
    }
    lifetime.abort()
    unregisterWebMcp()
  }
}

export function callViewTool(
  workspaceId: string,
  viewId: string,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
): Promise<JsonValue> {
  const entry = entries.get(keyFor(workspaceId, viewId, name))
  if (!entry)
    return Promise.reject(
      new Error(
        `Tool "${name}" is unavailable for view:${viewId}. Run moi tools view:${viewId} to discover its tools.`
      )
    )
  return entry.call(args, signal)
}
