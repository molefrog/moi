// Claude Code vocabulary — also the default when a call carries no provider.
import type { ToolCall } from '@/lib/types'

import { shellBrief } from './shell'
import { getInputValue, toolInput, type Shorten, type ToolFormatter } from './shared'

// Claude tool names are mostly already presentable (Read, Bash, …); only a few
// need spacing/relabelling. Unknown names fall through to the raw name so
// plugin tools still render something.
const LABELS: Record<string, string> = {
  ToolSearch: 'Tool search',
  WebSearch: 'Web search',
  WebFetch: 'Web fetch'
}

// Short tool label from a fully-qualified MCP tool name: `mcp__notion__notion-
// search` → `notion-search` (drop the `mcp__<server>__` prefix). Plain names
// pass through.
function shortToolName(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const parts = name.slice(5).split('__')
  return parts.length >= 2 ? parts.slice(1).join('__') : parts[0]
}

function brief(call: ToolCall, shorten: Shorten): string {
  const tool = call.name
  const input = toolInput(call)
  if (tool === 'Bash') return shellBrief(getInputValue(input, 'command'), shorten)
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

export const claudeFormatter: ToolFormatter = {
  displayName: call => LABELS[call.name] ?? call.name,
  brief
}
