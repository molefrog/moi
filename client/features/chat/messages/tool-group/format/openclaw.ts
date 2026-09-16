// OpenClaw vocabulary. An OpenClaw agent pinned to the `claude-cli` runtime
// reports Claude Code's own tool names (`Read`, `Bash`, `Edit`, …) and
// argument keys (`file_path`, not `path`), so the Claude formatter is the
// fallback for both the label and the brief before giving up.
import type { ToolCall } from '@/lib/types'

import { claudeFormatter } from './claude'
import { prettifyShellCommand, shellBrief } from './shell'
import { getInputValue, toolInput, type Shorten, type ToolFormatter } from './shared'

const LABELS: Record<string, string> = {
  read: 'Read file',
  write: 'Write file',
  edit: 'Edit file',
  apply_patch: 'Edit',
  exec: 'Bash',
  // 2026.7.2+ renamed the shell tool `bash` and split filesystem tools out.
  bash: 'Bash',
  ls: 'List files',
  find: 'Find files',
  grep: 'Search',
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

function openclawBrief(call: ToolCall, shorten: Shorten): string {
  const tool = call.name
  const input = toolInput(call)
  if (tool === 'read' || tool === 'write' || tool === 'edit')
    return shorten(getInputValue(input, 'path'))
  if (tool === 'apply_patch') {
    // The codex runtime describes an edit structurally: `{ changes: [{ path,
    // kind }] }` (captured live on 2026.7.1). Name the file, or count them when
    // one patch touches several.
    const changes = input.changes
    if (Array.isArray(changes) && changes.length > 0) {
      const paths = changes
        .map(c =>
          c && typeof c === 'object' ? getInputValue(c as Record<string, unknown>, 'path') : ''
        )
        .filter(Boolean)
      if (paths.length === 1) return shorten(paths[0])
      if (paths.length > 1) return `${paths.length} files`
    }
    // Older shape: the raw patch text, whose `*** ` header names the file.
    const patch = getInputValue(input, 'patch') || getInputValue(input, 'input')
    const firstLine = patch.split('\n').find(l => l.startsWith('*** ')) ?? patch.split('\n')[0]
    return shorten(firstLine ?? '')
  }
  if (tool === 'exec' || tool === 'bash') {
    // `command` on 2026.7.1 + the newer `bash` tool; the 2026.7.2 exec sandbox
    // instead carries a `code` script (JS that shells out) — show whichever.
    const command = getInputValue(input, 'command') || getInputValue(input, 'code')
    return shellBrief(command, shorten)
  }
  if (tool === 'ls' || tool === 'find' || tool === 'grep')
    return shorten(getInputValue(input, 'path') || getInputValue(input, 'pattern'))
  if (tool === 'process') {
    const action = getInputValue(input, 'action')
    const name = getInputValue(input, 'name')
    return (
      [action, name].filter(Boolean).join(' ') ||
      shorten(prettifyShellCommand(getInputValue(input, 'command')))
    )
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

export const openclawFormatter: ToolFormatter = {
  displayName: call => LABELS[call.name] ?? claudeFormatter.displayName(call),
  brief: (call, shorten) => openclawBrief(call, shorten) || claudeFormatter.brief(call, shorten)
}
