export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ViewTool<T extends Record<string, unknown> = Record<string, unknown>> = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
    consequentialHint?: boolean
  }
  execute: (args: T, options: { signal: AbortSignal }) => JsonValue | Promise<JsonValue>
}

export type ViewToolRequest = {
  type: 'view-tool:call'
  requestId: string
  workspaceId: string
  viewId: string
  name: string
  args: Record<string, unknown>
}

export type ViewToolEvent = ViewToolRequest | { type: 'view-tool:cancel'; requestId: string }

export const VIEW_TOOL_TIMEOUT_MS = 30_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Reject lossy JSON conversions (undefined, dates, non-finite numbers, cycles).
export function isJsonValue(value: unknown, seen = new Set<unknown>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return false
  seen.add(value)
  const valid = Object.values(value).every(item => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}
