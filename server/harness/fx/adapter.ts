import type { Turn } from '@/lib/format'
import type { ToolCall } from '@/lib/types'

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
    const prefix =
      /^\{"session_id":(null|"[^"]*"),"state":"(completed|running|failed)","backend":/.exec(text)
    if (!prefix) return undefined
    // Keep the leading fields that precede the cut: they say whether the
    // command is still running and under which background session id.
    return {
      preview: text,
      state: prefix[2],
      ...(prefix[1] !== 'null' ? { session_id: prefix[1]!.slice(1, -1) } : {})
    }
  }
}

// Status lines shown when a shell row has no streamed output of its own.
// They are display text only: accumulation reads `rawOutput.streamed`, so a
// placeholder can never become the prefix of later output.
const HISTORY_PREVIEW_ONLY = 'fx did not include command output in this history preview.'
const NO_OUTPUT = 'Command produced no output.'
const PLACEHOLDERS = new Set([HISTORY_PREVIEW_ONLY, NO_OUTPUT])

function shellStatusLine(
  envelope: Record<string, unknown>,
  commandResult: Record<string, unknown> | undefined,
  action: unknown
): string {
  const sessionId = typeof envelope.session_id === 'string' ? envelope.session_id : undefined
  // A yielded command keeps running after its invocation completes; fx then
  // streams its later output onto this same call.
  if (envelope.state === 'running') {
    return sessionId ? `Moved to the background as ${sessionId}.` : 'Moved to the background.'
  }
  if (commandResult?.stdout_bytes === 0 && commandResult?.stderr_bytes === 0) return NO_OUTPUT
  const exitCode = commandResult?.exit_code
  // `interact` waits on a yielded command: its output arrives on the call that
  // started it, so this row reports only how the command ended.
  if (action === 'interact' && typeof exitCode === 'number') {
    return `${sessionId ?? 'Command'} finished with exit code ${exitCode}.`
  }
  return HISTORY_PREVIEW_ONLY
}

function streamedOutput(previousCall: ToolCall | undefined): string {
  const raw = record(previousCall?.sidecar?.rawOutput)
  if (typeof raw?.streamed === 'string') return raw.streamed
  const output = typeof previousCall?.output === 'string' ? previousCall.output : ''
  return PLACEHOLDERS.has(output) ? '' : output
}

function terminalStatus(state: ToolCall['state'] | undefined): ToolCallUpdate['status'] {
  return state === 'success' ? 'completed' : state === 'error' ? 'failed' : undefined
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
  const streamed = streamedOutput(previousCall)
  const previousRaw = record(previousCall?.sidecar?.rawOutput) ?? {}
  const envelope = commandEnvelope(text)
  const commandResult = record(wire.command_result)
  if (envelope) {
    normalized = {
      ...normalized,
      rawOutput: {
        ...envelope,
        ...(wire.command_result !== undefined ? { command_result: wire.command_result } : {}),
        streamed
      },
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: streamed || shellStatusLine(envelope, commandResult, input?.action)
          }
        }
      ]
    }
  } else if (update.status === 'in_progress' && text) {
    const next = streamed + text
    normalized.rawOutput = { ...previousRaw, streamed: next }
    normalized.content = [{ type: 'content', content: { type: 'text', text: next } }]
    // A yielded command's late output arrives after its invocation settled.
    // Keep the settled outcome: moi would otherwise reopen the row and mark
    // it unfinished when the turn ends.
    const settled = terminalStatus(previousCall?.state)
    if (settled) normalized.status = settled
  }
  return normalized
}

// fx sends diagnostics as ordinary agent text under their own message id.
// Prefixes stay short enough to classify while a live preview is buffered.
const OPERATIONAL =
  /^(?:\[context\]|skill discovery warning:|Previous tool execution:|\[Response interrupted)/i
// A failed model request: `HTTP 502: detail`, or an auth failure such as
// `AI_GATEWAY_API_KEY authentication failed · HTTP 401`. The prompt then ends
// with stopReason `refused`.
const PROVIDER_FAILURE =
  /^(?:HTTP \d{3}(?:: [^\n]*)?|\S+ (?:authentication|credential refresh) failed(?: · HTTP \d{3})?)$/
// History replays an interrupted turn's outcome as its own agent message.
const INTERRUPTED_OUTCOME = /^(?:cancelled|failed)$/

export function isFxOperationalMessage(text: string, context?: { replaying: boolean }): boolean {
  const trimmed = text.trim()
  return (
    OPERATIONAL.test(trimmed) ||
    PROVIDER_FAILURE.test(trimmed) ||
    (context?.replaying === true && INTERRUPTED_OUTCOME.test(trimmed))
  )
}

export function describeFxOperationalMessage(text: string): string {
  const trimmed = text.trim()
  if (trimmed === 'cancelled') return 'This run was stopped before it finished.'
  if (trimmed === 'failed') return 'This run ended with an error before it finished.'
  if (/^\[Response interrupted/i.test(trimmed)) {
    return 'The response was interrupted. fx restarted it from the beginning.'
  }
  if (PROVIDER_FAILURE.test(trimmed)) return `The model request failed: ${trimmed}`
  return trimmed
}
