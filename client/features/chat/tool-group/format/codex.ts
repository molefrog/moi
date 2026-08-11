// Codex vocabulary. Codex emits semantic items, which the adapter maps to a
// small fixed set of tool names (plus raw MCP tool names, which fall through
// unchanged).
import type { ToolCall } from '@/lib/types'

import { getInputValue, toolInput, type Shorten, type ToolFormatter } from './shared'

// Exported for mcp.ts: these management pseudo-tools stay plain rows, never
// the server-branded MCP card.
export const CODEX_TOOL_LABELS: Record<string, string> = {
  exec: 'Bash',
  apply_patch: 'Edit',
  web_search: 'Web search',
  update_plan: 'Update plan',
  subagent: 'Run sub-agent',
  subagent_activity: 'Sub-agent',
  review: 'Review',
  view_image: 'View image',
  generate_image: 'Generate image',
  // MCP-management introspection (can arrive under any server, incl. the
  // "codex" pseudo-server) — plain rows, never the server-branded card.
  list_mcp_resources: 'List MCP resources',
  list_mcp_resource_templates: 'List MCP templates',
  read_mcp_resource: 'Read MCP resource'
}

// Codex classifies each shell command itself (`commandActions`, one entry per
// piped command). When every action agrees on a type, use a CC-style semantic
// label instead of "Bash".
type CommandAction = { type?: string; name?: string; path?: string; query?: string | null }

const ACTION_LABELS: Record<string, string> = {
  read: 'Read',
  listFiles: 'List files',
  search: 'Search'
}

function execAction(input: unknown): CommandAction | null {
  const actions = (input as { commandActions?: unknown } | null)?.commandActions
  if (!Array.isArray(actions) || actions.length === 0) return null
  const first = actions[0] as CommandAction
  const type = first?.type
  if (!type || !(type in ACTION_LABELS)) return null
  if (actions.some(a => (a as CommandAction)?.type !== type)) return null
  return first
}

// Codex collab tool actions (`input.action` on the `subagent` card). `wait`
// never reaches the UI — the adapter drops it.
const SUBAGENT_ACTION_LABELS: Record<string, string> = {
  spawn_agent: 'Run sub-agent',
  send_input: 'Message the agent',
  resume_agent: 'Resume the agent',
  close_agent: 'Stopping the agent'
}

function displayName(call: ToolCall): string {
  if (call.name === 'exec') {
    const action = execAction(call.input)
    if (action?.type) return ACTION_LABELS[action.type]
  }
  if (call.name === 'subagent') {
    const action = (call.input as { action?: unknown } | null)?.action
    if (typeof action === 'string' && action in SUBAGENT_ACTION_LABELS) {
      return SUBAGENT_ACTION_LABELS[action]
    }
  }
  return CODEX_TOOL_LABELS[call.name] ?? call.name
}

function brief(call: ToolCall, shorten: Shorten): string {
  const tool = call.name
  const input = toolInput(call)
  if (tool === 'exec') {
    // Semantic brief when Codex classified the command (label says Read/
    // Search/List files); raw command otherwise.
    const action = execAction(input)
    if (action?.type === 'read') return shorten(action.path || action.name || '')
    if (action?.type === 'search')
      return [action.query && `/${action.query}/`, action.path && shorten(action.path)]
        .filter(Boolean)
        .join(' ')
    if (action?.type === 'listFiles') return action.path ? shorten(action.path) : ''
    return shorten(`$ ${getInputValue(input, 'command')}`)
  }
  if (tool === 'apply_patch') {
    // The adapter sends structured per-file changes: [{ path, kind, diff }].
    const changes = input.changes
    if (Array.isArray(changes)) {
      const paths = changes
        .map(c => (c && typeof c === 'object' ? (c as { path?: unknown }).path : undefined))
        .filter((p): p is string => typeof p === 'string')
        .map(shorten)
      return paths.join(', ')
    }
    return ''
  }
  if (tool === 'web_search') {
    // Multi-query fan-outs carry every query in `queries`; single searches
    // just have `query`.
    const queries = input.queries
    if (Array.isArray(queries) && queries.length > 0) {
      return queries.filter((q): q is string => typeof q === 'string').join(' · ')
    }
    return getInputValue(input, 'query')
  }
  if (tool === 'update_plan') {
    const plan = input.plan
    return typeof plan === 'string' ? plan.split('\n')[0] : ''
  }
  if (tool === 'subagent') {
    // The label already names the action; the brief carries the text being
    // sent (spawn prompt, send_input/resume_agent message). close_agent has
    // none — the label alone reads fine.
    if (getInputValue(input, 'action') === 'close_agent') return ''
    return getInputValue(input, 'prompt')
  }
  if (tool === 'subagent_activity') return getInputValue(input, 'kind')
  if (tool === 'generate_image') return getInputValue(input, 'prompt').split('\n')[0]
  if (tool === 'read_mcp_resource') return getInputValue(input, 'uri')
  if (tool === 'list_mcp_resources' || tool === 'list_mcp_resource_templates')
    return getInputValue(input, 'server')
  return ''
}

export const codexFormatter: ToolFormatter = { displayName, brief }
