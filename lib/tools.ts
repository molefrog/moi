// The public tool contract is independent of its execution location or transport.
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ToolDescriptor = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
    consequentialHint?: boolean
  }
}

export type Tool<T extends Record<string, unknown> = Record<string, unknown>> = ToolDescriptor & {
  execute: (args: T, options?: { signal: AbortSignal }) => JsonValue | Promise<JsonValue>
}
export type ServerTool<T extends Record<string, unknown> = Record<string, unknown>> = Omit<
  Tool<T>,
  'name'
>
export type ToolInfo = ToolDescriptor & {
  runtime: 'server' | 'ui'
  requiresLiveView: boolean
}

export function isToolName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9_.-]+$/.test(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Reject lossy JSON conversions (undefined, dates, non-finite numbers, cycles).
export function isJsonValue(value: unknown, seen = new Set<unknown>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false
  if (Object.getOwnPropertySymbols(value).length > 0) return false
  if (
    Array.isArray(value) &&
    !Object.keys(value).every(
      (key, index, keys) => keys.length === value.length && key === `${index}`
    )
  )
    return false
  seen.add(value)
  const valid = Object.values(value).every(item => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}

export function toolInfo(descriptor: ToolDescriptor, runtime: ToolInfo['runtime']): ToolInfo {
  return {
    ...descriptor,
    runtime,
    requiresLiveView: runtime === 'ui'
  }
}
