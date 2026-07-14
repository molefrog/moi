// Formatting utils for tool rows: turn a raw ToolCall into the display name and
// one-line brief, and parse the two MCP call shapes. Pure functions, no React.
import { relative } from 'pathe'

import type { ToolCall } from '@/lib/types'

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

// Drop the redundant server prefix many MCP tools repeat — the icon + server name
// already identify it: `notion-search` → `search`, `notion-get-teams` →
// `get-teams`. Tools that don't repeat the server pass through unchanged.
export function formatMcpTool(server: string, tool: string): string {
  const lower = tool.toLowerCase()
  const sep = ['-', '_', '.'].find(s => lower.startsWith(server.toLowerCase() + s))
  return sep ? tool.slice(server.length + 1) : tool
}

function getInputValue(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

// Human byte size of a string (UTF-8): `124B`, `2.5KB`.
export function formatBytes(text: string): string {
  const n = new TextEncoder().encode(text).length
  return n < 1024 ? `${n}B` : `${(n / 1024).toFixed(1)}KB`
}

// Compact wall-clock duration: sub-second → "850ms", under a minute → "3.2s" /
// "11s", longer → "1m 5s". Used on the subagent card's duration badge.
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return rem ? `${m}m ${rem}s` : `${m}m`
}

function makeShortenPaths(cwd: string | null) {
  return (s: string) =>
    s.replace(/\/[^\s"']+/g, p => {
      if (!cwd) return p
      const rel = relative(cwd, p)
      return rel.startsWith('..') ? p : rel
    })
}

// Tool name → user-facing label, picked per provider. Adapters send the raw
// upstream tool name; the UI humanizes it. Unknown names fall through to the raw
// name so plugin tools still render something.
const OPENCLAW_TOOL_LABELS: Record<string, string> = {
  read: 'Read file',
  write: 'Write file',
  edit: 'Edit file',
  apply_patch: 'Edit',
  exec: 'Bash',
  process: 'Manage process',
  web_search: 'Web search',
  web_fetch: 'Fetch',
  sessions_list: 'List sessions',
  sessions_history: 'Recall session',
  sessions_yield: 'Yield to session',
  sessions_send: 'Send to session',
  sessions_spawn: 'Spawn session',
  subagents: 'Run sub-agent',
  agents_list: 'List agents',
  session_status: 'Session status',
  image: 'Analyze image',
  image_generate: 'Generate image',
  memory_get: 'Read memory',
  memory_search: 'Search memory',
  update_plan: 'Update plan',
  message: 'Send message',
  browser: 'Browser',
  canvas: 'Canvas',
  cron: 'Cron',
  gateway: 'Gateway',
  code_execution: 'Run Python',
  tts: 'Text-to-speech',
  music_generate: 'Generate music',
  video_generate: 'Generate video',
  x_search: 'Search X'
}

// Claude tool names are mostly already presentable (Read, Bash, …); only a few
// need spacing/relabelling.
const CLAUDE_TOOL_LABELS: Record<string, string> = {
  ToolSearch: 'Tool Search',
  WebSearch: 'Web Search',
  WebFetch: 'Web Fetch'
}

export function getToolDisplayName(call: ToolCall): string {
  if (call.provider === 'openclaw') return OPENCLAW_TOOL_LABELS[call.name] ?? call.name
  return CLAUDE_TOOL_LABELS[call.name] ?? call.name
}

// Short tool label from a fully-qualified MCP tool name: `mcp__notion__notion-
// search` → `notion-search` (drop the `mcp__<server>__` prefix). Plain names
// pass through.
function shortToolName(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const parts = name.slice(5).split('__')
  return parts.length >= 2 ? parts.slice(1).join('__') : parts[0]
}

export function formatInputBrief(call: ToolCall, cwd: string | null): string {
  const input = (call.input as Record<string, unknown>) ?? {}
  const shorten = makeShortenPaths(cwd)
  if (call.provider === 'openclaw') return formatOpenClawBrief(call.name, input, shorten)
  return formatClaudeBrief(call.name, input, shorten)
}

function formatClaudeBrief(
  tool: string,
  input: Record<string, unknown>,
  shorten: (s: string) => string
): string {
  if (tool === 'Bash') return shorten(`$ ${getInputValue(input, 'command')}`)
  if (tool === 'Read' || tool === 'Write' || tool === 'Edit')
    return shorten(getInputValue(input, 'file_path'))
  if (tool === 'Glob') return shorten(getInputValue(input, 'pattern'))
  if (tool === 'Grep')
    return `/${getInputValue(input, 'pattern')}/ ${shorten(getInputValue(input, 'path'))}`
  if (tool === 'WebSearch') return getInputValue(input, 'query')
  if (tool === 'WebFetch') return getInputValue(input, 'url')
  if (tool === 'ToolSearch') {
    const query = getInputValue(input, 'query')
    // `select:a,b,c` loads those tools → list their short names; otherwise it's a
    // free-text discovery query → show it as-is.
    if (query.startsWith('select:')) return query.slice(7).split(',').map(shortToolName).join(', ')
    return query
  }
  return ''
}

function formatOpenClawBrief(
  tool: string,
  input: Record<string, unknown>,
  shorten: (s: string) => string
): string {
  if (tool === 'read' || tool === 'write' || tool === 'edit')
    return shorten(getInputValue(input, 'path'))
  if (tool === 'apply_patch') {
    const patch = getInputValue(input, 'patch')
    const firstLine = patch.split('\n').find(l => l.startsWith('*** ')) ?? patch.split('\n')[0]
    return shorten(firstLine ?? '')
  }
  if (tool === 'exec') return shorten(`$ ${getInputValue(input, 'command')}`)
  if (tool === 'process') {
    const action = getInputValue(input, 'action')
    const name = getInputValue(input, 'name')
    return [action, name].filter(Boolean).join(' ') || shorten(getInputValue(input, 'command'))
  }
  if (tool === 'web_search' || tool === 'x_search') return getInputValue(input, 'query')
  if (tool === 'web_fetch') return getInputValue(input, 'url')
  if (tool === 'memory_search') return getInputValue(input, 'query')
  if (tool === 'memory_get') return getInputValue(input, 'key') || getInputValue(input, 'name')
  if (tool === 'sessions_history' || tool === 'sessions_send' || tool === 'sessions_yield')
    return getInputValue(input, 'sessionKey') || getInputValue(input, 'agentId')
  if (tool === 'sessions_list' || tool === 'agents_list') return getInputValue(input, 'agentId')
  if (tool === 'subagents' || tool === 'sessions_spawn')
    return getInputValue(input, 'task') || getInputValue(input, 'agentId')
  if (tool === 'image' || tool === 'image_generate')
    return getInputValue(input, 'prompt') || shorten(getInputValue(input, 'path'))
  if (tool === 'message') return getInputValue(input, 'recipient') || getInputValue(input, 'to')
  if (tool === 'update_plan') {
    const plan = input.plan
    if (Array.isArray(plan)) {
      const inProgress = plan.find(
        (p): p is { step: string } =>
          !!p && typeof p === 'object' && (p as { status?: unknown }).status === 'in_progress'
      )
      const step = inProgress?.step ?? (plan[0] as { step?: unknown })?.step
      if (typeof step === 'string') return step
    }
    return ''
  }
  return ''
}
