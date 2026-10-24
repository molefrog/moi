import type { JsonValue, ServerTool } from 'moi'

export type { JsonValue } from 'moi'

export type Tool = ServerTool & { name: string }
export type ToolDescriptor = Omit<Tool, 'execute'>

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
    (Object.keys(value).length !== value.length ||
      !Object.keys(value).every((key, index) => key === `${index}`))
  )
    return false
  seen.add(value)
  const valid = Object.values(value).every(item => isJsonValue(item, seen))
  seen.delete(value)
  return valid
}
