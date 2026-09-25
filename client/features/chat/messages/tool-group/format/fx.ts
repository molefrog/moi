// fx supplies native tool names; its generic ACP titles ("Running", "Reading",
// "Waiting for") are not specific enough for the label and brief on a tool row.
// Several fx tools wrap their arguments in `request` and switch on `action`.
import type { ToolCall } from '@/lib/types'

import { shellBrief } from './shell'
import { getInputValue, toolInput, type Shorten, type ToolFormatter } from './shared'

const LABELS: Record<string, string> = {
  read_file: 'Read',
  file_read: 'Read',
  write_file: 'Write',
  file_write: 'Write',
  edit_file: 'Edit',
  apply_patch: 'Edit',
  glob_files: 'Find files',
  grep_files: 'Search files',
  web_fetch: 'Fetch webpage',
  web_search: 'Web search',
  capability_search: 'Search capabilities',
  skill: 'Read skill',
  install_skill: 'Install skill',
  read_tool_result: 'Read full result',
  ask_user_question: 'Ask a question',
  mcp_select_tool: 'Load MCP tool',
  mcp_features: 'Use MCP server'
}

const SHELL_LABELS: Record<string, string> = {
  run: 'Run command',
  interact: 'Wait for command',
  stop: 'Stop command'
}

const SUBAGENT_LABELS: Record<string, string> = {
  run: 'Run subagent',
  message: 'Message subagent'
}

function args(call: ToolCall): Record<string, unknown> {
  const input = toolInput(call)
  const request = input.request
  return request && typeof request === 'object' && !Array.isArray(request)
    ? (request as Record<string, unknown>)
    : input
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0] ?? ''
}

// A skill's advertised location is a path to its folder or SKILL.md; the
// folder name is the skill's name.
function skillName(location: string): string {
  const parts = location.replace(/\/SKILL\.md$/i, '').split(/[\\/]/)
  return parts.at(-1) || location
}

function brief(call: ToolCall, shorten: Shorten): string {
  const input = args(call)
  switch (call.name) {
    case 'shell': {
      const action = getInputValue(input, 'action')
      if (action === 'interact' || action === 'stop') return getInputValue(input, 'session_id')
      return shellBrief(getInputValue(input, 'command'), shorten)
    }
    case 'subagent': {
      const text = getInputValue(input, 'task') || getInputValue(input, 'message')
      const agent = getInputValue(input, 'agent')
      return [agent, firstLine(text)].filter(Boolean).join(' · ')
    }
    case 'glob_files':
    case 'grep_files':
      return getInputValue(input, 'pattern')
    case 'web_fetch':
      return getInputValue(input, 'url')
    case 'web_search':
    case 'capability_search':
      return getInputValue(input, 'query')
    case 'skill': {
      const location = getInputValue(input, 'location')
      if (!location) return ''
      const resource = getInputValue(input, 'resource')
      return resource ? `${skillName(location)} · ${resource}` : skillName(location)
    }
    case 'install_skill':
      return getInputValue(input, 'skill') || getInputValue(input, 'source')
    case 'read_tool_result':
      return getInputValue(input, 'query')
    case 'mcp_select_tool':
      return getInputValue(input, 'name')
    case 'mcp_features':
      return [getInputValue(input, 'server'), getInputValue(input, 'action')]
        .filter(Boolean)
        .join(' · ')
    default:
      return shorten(getInputValue(input, 'path') || getInputValue(input, 'file_path'))
  }
}

export const fxFormatter: ToolFormatter = {
  displayName: call => {
    const action = getInputValue(args(call), 'action')
    if (call.name === 'shell') return SHELL_LABELS[action] ?? 'Run command'
    if (call.name === 'subagent') return SUBAGENT_LABELS[action] ?? 'Subagent'
    if (LABELS[call.name]) return LABELS[call.name]
    const label = call.name.replace(/_/g, ' ')
    return label.charAt(0).toUpperCase() + label.slice(1)
  },
  brief
}
