import { abortable, prepareTool } from '@/lib/tool-execution'
import type { JsonValue, Tool, ToolDescriptor } from '@/lib/tools'

export { abortable }
type Entry = ReturnType<typeof prepareTool> & {
  runtime: 'server' | 'ui'
  workspaceId: string
  viewId: string
}
type NativeContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => Promise<void> | void
}
const entries = new Map<string, Entry>()
const catalogs = new Map<string, Promise<ToolDescriptor[]>>()
const listeners = new Set<() => void>()
const keyFor = (workspaceId: string, viewId: string, name?: string) =>
  JSON.stringify([workspaceId, viewId, name ?? null])
const changed = () => {
  for (const listener of listeners) listener()
}

// A parked Activity removes registrations, but its bundle still owns these
// names. Keep that namespace until bundle disposal so parking cannot hide a
// server/UI collision from the CLI resolver.
const declarations = new Map<object, { workspaceId: string; viewId: string; names: Set<string> }>()
export function rememberViewTool(owner: object, workspaceId: string, viewId: string, name: string) {
  const entry = declarations.get(owner) ?? { workspaceId, viewId, names: new Set<string>() }
  entry.names.add(name)
  declarations.set(owner, entry)
  changed()
}
export function forgetViewTools(owner: object) {
  declarations.delete(owner)
  changed()
}
export function viewToolNames(workspaceId: string, viewId: string): string[] {
  return [
    ...new Set([
      ...listViewTools(workspaceId, viewId).map(tool => tool.name),
      ...[...declarations.values()]
        .filter(entry => entry.workspaceId === workspaceId && entry.viewId === viewId)
        .flatMap(entry => [...entry.names])
    ])
  ]
}

export function onViewToolsChanged(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function listViewTools(workspaceId: string, viewId: string): ToolDescriptor[] {
  return [...entries.values()]
    .filter(
      entry =>
        entry.workspaceId === workspaceId && entry.viewId === viewId && entry.runtime === 'ui'
    )
    .map(entry => entry.descriptor)
}

// Installed by the host slot outside React Activity, so parked UI handlers can
// still check the server namespace when they wake. No module code enters here.
export function setServerToolCatalog(
  workspaceId: string,
  viewId: string,
  catalog: Promise<ToolDescriptor[]>
) {
  const key = keyFor(workspaceId, viewId)
  catalogs.set(key, catalog)
  return () => {
    if (catalogs.get(key) === catalog) catalogs.delete(key)
  }
}

async function registerNativeTool(
  workspaceId: string,
  viewId: string,
  tool: Tool,
  signal: AbortSignal
) {
  const context =
    typeof document === 'undefined'
      ? undefined
      : (document as Document & { modelContext?: NativeContext }).modelContext
  if (!context?.registerTool) return
  // Native names have a 128-character limit. Keep a readable operation prefix
  // and hash the full identity so long workspace/view names cannot collide.
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(keyFor(workspaceId, viewId, tool.name))
  )
  if (signal.aborted) return
  const suffix = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(
    ''
  )
  await context.registerTool(
    {
      ...tool,
      name: `moi_${tool.name.slice(0, 48)}_${suffix}`,
      description: `view:${viewId}/${tool.name}: ${tool.description}`
    },
    { signal }
  )
}

export function registerViewTool(
  workspaceId: string,
  viewId: string,
  tool: Tool,
  report: (message: string) => void,
  runtime: 'server' | 'ui' = 'ui'
): () => void {
  const key = keyFor(workspaceId, viewId, tool.name)
  if (entries.has(key)) throw new Error(`Duplicate tool: view:${viewId}/${tool.name}`)
  const prepared = prepareTool(tool)
  const lifetime = new AbortController()
  const entry: Entry = {
    descriptor: prepared.descriptor,
    runtime,
    workspaceId,
    viewId,
    async call(args, signal) {
      const combined = AbortSignal.any([signal, lifetime.signal])
      combined.throwIfAborted()
      const catalog = catalogs.get(keyFor(workspaceId, viewId))
      if (runtime === 'ui' && catalog) {
        const serverTools = await abortable(catalog, combined)
        if (serverTools.some(server => server.name === tool.name))
          throw new Error(
            `Duplicate tool: view:${viewId}/${tool.name} is defined on both the server and the UI.`
          )
      }
      return prepared.call(args, combined)
    }
  }
  entries.set(key, entry)
  changed()
  void registerNativeTool(
    workspaceId,
    viewId,
    {
      ...prepared.descriptor,
      execute: (args, options) => entry.call(args, options?.signal ?? lifetime.signal)
    },
    lifetime.signal
  ).catch(error => {
    if (!lifetime.signal.aborted) report(`WebMCP registration failed: ${String(error)}`)
  })
  return () => {
    if (entries.get(key) === entry) {
      entries.delete(key)
      changed()
    }
    lifetime.abort()
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
  if (!entry || entry.runtime !== 'ui')
    return Promise.reject(
      new Error(
        `Tool view:${viewId}/${name} is unavailable. Run moi call view:${viewId} to discover its tools.`
      )
    )
  return entry.call(args, signal)
}
