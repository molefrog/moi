// fx supplies native tool names; its generic ACP titles ("Running", "Reading")
// are not specific enough for the label and brief on a tool row.
import type { ToolCall } from '@/lib/types'

import { shellBrief } from './shell'
import { getInputValue, toolInput, type Shorten, type ToolFormatter } from './shared'

const LABELS: Record<string, string> = {
  shell: 'Run command',
  read_file: 'Read',
  file_read: 'Read',
  write_file: 'Write',
  file_write: 'Write',
  edit_file: 'Edit',
  apply_patch: 'Edit'
}

function brief(call: ToolCall, shorten: Shorten): string {
  const input = toolInput(call)
  const request = input.request
  const args =
    request && typeof request === 'object' && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : input
  if (call.name === 'shell') return shellBrief(getInputValue(args, 'command'), shorten)
  return shorten(getInputValue(args, 'path') || getInputValue(args, 'file_path'))
}

export const fxFormatter: ToolFormatter = {
  displayName: call => {
    if (LABELS[call.name]) return LABELS[call.name]
    const label = call.name.replace(/_/g, ' ')
    return label.charAt(0).toUpperCase() + label.slice(1)
  },
  brief
}
