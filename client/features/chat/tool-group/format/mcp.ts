// Parsers for the three MCP call shapes — these decide when a row renders as
// the server-branded MCP card instead of a plain tool row.
import type { ToolCall } from '@/lib/types'

import { CODEX_TOOL_LABELS } from './codex'

export type McpRef = { server: string; tool: string; rest: string }

// Detect a `mcporter call <server>.<tool> [args...]` invocation inside a shell
// command. Accepts any prefix (env VAR=…, `$(which mcporter)`, `npx mcporter`),
// stops at the first command separator so a chained command doesn't bleed into
// `rest`. Returns null for non-`call` invocations.
export function parseMcporterCall(call: ToolCall): McpRef | null {
  const isShell = call.name === 'Bash' || call.name === 'exec'
  if (!isShell) return null
  const input = (call.input as Record<string, unknown>) ?? {}
  const command = typeof input.command === 'string' ? input.command : ''
  if (!command) return null
  const m = command.match(
    /(?:^|\s|\$\()mcporter(?:\)?)\s+call\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)((?:\s+(?!&&|\|\||;|\|)\S+)*)/
  )
  if (!m) return null
  return { server: m[1], tool: m[2], rest: (m[3] ?? '').trim() }
}

// Native MCP tool calls arrive as `mcp__<server>__<tool>` (the server is encoded
// in the name; `caller` is `model` and `mcpServer` is unset). Server tokens use
// single underscores, so split on the FIRST `__` after the prefix.
// e.g. `mcp__notion__notion-search` → notion / notion-search.
export function parseNativeMcp(call: ToolCall): McpRef | null {
  const name = call.name
  if (!name.startsWith('mcp__')) return null
  const rest = name.slice(5)
  const i = rest.indexOf('__')
  if (i <= 0) return null
  return { server: rest.slice(0, i), tool: rest.slice(i + 2), rest: '' }
}

// Codex MCP calls arrive with a real `mcpServer` field and a plain tool name.
// Two shapes get the server-branded card:
//   - a call against a configured server (`server: "codex_apps"`), where app
//     tools are dotted `<app>.<tool>` (`resume_io.build_resume_with_templates`)
//     — brand by the app, not the host;
//   - anything else brands by the server itself.
// Codex's own MCP-management pseudo-tools (`server: "codex"`, or the
// list/read management names on any server) stay plain rows — they're
// runtime introspection, not a call INTO a server (see CODEX_TOOL_LABELS).
export function parseCodexMcp(call: ToolCall): McpRef | null {
  if (call.provider !== 'codex' || !call.mcpServer) return null
  if (call.name in CODEX_TOOL_LABELS) return null
  if (call.mcpServer === 'codex') return null
  const dot = call.name.indexOf('.')
  if (dot > 0) return { server: call.name.slice(0, dot), tool: call.name.slice(dot + 1), rest: '' }
  return { server: call.mcpServer, tool: call.name, rest: '' }
}

// Drop the redundant server prefix many MCP tools repeat — the icon + server name
// already identify it: `notion-search` → `search`, `notion-get-teams` →
// `get-teams`. Tools that don't repeat the server pass through unchanged.
export function formatMcpTool(server: string, tool: string): string {
  const lower = tool.toLowerCase()
  const sep = ['-', '_', '.'].find(s => lower.startsWith(server.toLowerCase() + s))
  return sep ? tool.slice(server.length + 1) : tool
}
