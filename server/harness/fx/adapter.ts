import type { Turn } from '@/lib/format'

import { type ToolCallUpdate, toolContentToText } from '../acp/wire'

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function commandEnvelope(text: string): Record<string, unknown> | undefined {
  try {
    const value = record(JSON.parse(text))
    return value &&
      typeof value.state === 'string' &&
      ('exit_code' in value || 'execution_id' in value || 'session_id' in value)
      ? value
      : undefined
  } catch {
    // The 200-byte ACP preview can cut this JSON inside full_output_handle.
    // Match the provider's envelope prefix, not arbitrary JSON tool output.
    return /^\{"session_id":(?:null|"[^"]*"),"state":"(?:completed|running|failed)","backend":/.test(
      text
    )
      ? { preview: text }
      : undefined
  }
}

export function normalizeFxToolUpdate(update: ToolCallUpdate, previous?: Turn): ToolCallUpdate {
  const previousCall = previous?.parts.find(part => part.type === 'tool-call')?.call
  const wire = update as ToolCallUpdate & { name?: string; command_result?: unknown }
  const name = wire.name || previousCall?.name
  const rawInput = record(update.rawInput ?? previousCall?.input)
  const input = record(rawInput?.request) ?? rawInput
  let normalized: ToolCallUpdate = {
    ...update,
    ...(wire.name ? { title: wire.name } : {}),
    ...(input && update.rawInput !== undefined ? { rawInput: input } : {}),
    ...(update.locations === undefined && typeof input?.path === 'string'
      ? { locations: [{ path: input.path }] }
      : {})
  }
  if (wire.command_result !== undefined) {
    normalized.rawOutput = { command_result: wire.command_result }
  }
  // Only shell text is incremental. Web-search progress and file output are
  // replacement snapshots and must retain the shared ACP semantics.
  if (name !== 'shell' || !update.content?.length) return normalized
  const text = toolContentToText(update.content)
  const priorText = typeof previousCall?.output === 'string' ? previousCall.output : ''
  const envelope = commandEnvelope(text)
  if (envelope) {
    normalized = {
      ...normalized,
      rawOutput: {
        ...envelope,
        ...(wire.command_result !== undefined ? { command_result: wire.command_result } : {})
      },
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text:
              priorText ||
              (record(wire.command_result)?.stdout_bytes === 0 &&
              record(wire.command_result)?.stderr_bytes === 0
                ? 'Command produced no output.'
                : 'fx did not include command output in this history preview.')
          }
        }
      ]
    }
  } else if (update.status === 'in_progress' && text) {
    normalized.content = [{ type: 'content', content: { type: 'text', text: priorText + text } }]
  }
  return normalized
}

export function isFxOperationalMessage(text: string): boolean {
  return /^(?:\[context\]|skill discovery warning:|Previous tool execution:)/i.test(
    text.trimStart()
  )
}
