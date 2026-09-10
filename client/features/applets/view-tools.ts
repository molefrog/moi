import Ajv from 'ajv/dist/2020'

import { isJsonValue, isRecord, type JsonValue, type ViewTool } from '@/lib/view-tools'

type Entry = {
  call: (args: Record<string, unknown>, signal: AbortSignal) => Promise<JsonValue>
}
type NativeContext = {
  registerTool: (tool: ViewTool, options: { signal: AbortSignal }) => Promise<void> | void
}

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
const entries = new Map<string, Entry>()
const keyFor = (workspaceId: string, viewId: string, name: string) =>
  JSON.stringify([workspaceId, viewId, name])

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Tool call cancelled. State may already have changed.'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function registerViewTool(
  workspaceId: string,
  viewId: string,
  tool: ViewTool,
  report: (message: string) => void
): () => void {
  if (!/^[A-Za-z0-9_-]+$/.test(tool.name) || !tool.description.trim()) {
    throw new Error(
      'A tool needs a name containing letters, digits, underscores or hyphens, and a description.'
    )
  }
  const key = keyFor(workspaceId, viewId, tool.name)
  if (entries.has(key)) throw new Error(`Duplicate tool: view:${viewId}/${tool.name}`)
  const validate = ajv.compile(tool.inputSchema)
  // Validators remain usable after removing the cache entry; parked views re-register often.
  ajv.removeSchema(tool.inputSchema)
  const lifetime = new AbortController()
  const entry: Entry = {
    async call(args, signal) {
      const combined = AbortSignal.any([signal, lifetime.signal])
      combined.throwIfAborted()
      if (!isRecord(args) || !validate(args))
        throw new Error(`Invalid tool arguments: ${ajv.errorsText(validate.errors)}`)
      const result = await abortable(
        Promise.resolve().then(() => {
          combined.throwIfAborted()
          return tool.execute(args, { signal: combined })
        }),
        combined
      )
      if (!isJsonValue(result)) throw new Error('Tools must return a JSON-serializable result.')
      return result
    }
  }
  entries.set(key, entry)

  // Native registration is optional. The CLI invokes this exact same checked handler.
  const context =
    typeof document === 'undefined'
      ? undefined
      : (document as Document & { modelContext?: NativeContext }).modelContext
  if (context?.registerTool) {
    // Encode the entire tuple, including separators, to avoid namespace collisions.
    const name =
      'moi_' +
      Array.from(new TextEncoder().encode(key), byte => byte.toString(16).padStart(2, '0')).join('')
    try {
      Promise.resolve(
        context.registerTool(
          {
            ...tool,
            name,
            description: `view:${viewId}/${tool.name}: ${tool.description}`,
            execute: (args, options) => entry.call(args, options?.signal ?? lifetime.signal)
          },
          { signal: lifetime.signal }
        )
      ).catch(error => {
        if (!lifetime.signal.aborted) report(`WebMCP registration failed: ${String(error)}`)
      })
    } catch (error) {
      report(`WebMCP registration failed: ${String(error)}`)
    }
  }
  return () => {
    if (entries.get(key) === entry) entries.delete(key)
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
  if (!entry)
    return Promise.reject(
      new Error(`Tool view:${viewId}/${name} is unavailable. Read the view source for its tools.`)
    )
  return entry.call(args, signal)
}
