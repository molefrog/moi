// Formatting utils for tool rows: turn a raw ToolCall into the display name
// and one-line brief. Each provider vocabulary lives in its own module; this
// file only dispatches on `call.provider` and re-exports the shared helpers.
import type { ToolCall } from '@/lib/types'

import { claudeFormatter } from './claude'
import { codexFormatter } from './codex'
import { hermesFormatter } from './hermes'
import { openclawFormatter } from './openclaw'
import { makeShortenPaths, type ToolFormatter } from './shared'

export { formatDuration } from './shared'
export { formatMcpTool, parseCodexMcp, parseMcporterCall, parseNativeMcp, type McpRef } from './mcp'

const FORMATTERS: Record<NonNullable<ToolCall['provider']>, ToolFormatter> = {
  'claude-code': claudeFormatter,
  openclaw: openclawFormatter,
  codex: codexFormatter,
  hermes: hermesFormatter
}

// Calls persisted before the provider field existed carry none — they came
// from Claude Code, which is also the default vocabulary.
function formatterFor(call: ToolCall): ToolFormatter {
  return FORMATTERS[call.provider ?? 'claude-code']
}

export function getToolDisplayName(call: ToolCall): string {
  return formatterFor(call).displayName(call)
}

export function formatInputBrief(call: ToolCall, cwd: string | null): string {
  return formatterFor(call).brief(call, makeShortenPaths(cwd))
}
