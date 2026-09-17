// Hermes vocabulary. ACP backends send display-ready titles rather than raw
// function names, in three shapes (`acp_adapter/tools.py` build_tool_title):
// "terminal: echo hi", "todo (4 items)", "patch (replace): a.txt". The input
// is almost always empty (only file/search tools get a synthesized `{path}`
// from ACP locations), so the title is the only source for both the label and
// the brief.
import type { ToolCall } from '@/lib/types'

import { prettifyShellCommand } from './shell'
import type { Shorten, ToolFormatter } from './shared'

// Split the action from its parenthesized qualifier and colon detail so the
// label/brief split matches every other provider.
function splitTitle(name: string): { action: string; qualifier: string; detail: string } {
  const idx = name.indexOf(':')
  const head = (idx > 0 ? name.slice(0, idx) : name).trim()
  const detail = idx > 0 ? name.slice(idx + 1).trim() : ''
  const m = head.match(/^(.*?)\s*\(([^)]*)\)$/)
  if (!m) return { action: head, qualifier: '', detail }
  return { action: m[1].trim(), qualifier: m[2].trim(), detail }
}

// Keyed by the title's action part — multi-word for tools whose title embeds
// the sub-action ("process wait", "skills list"). Unmatched actions fall back
// to sentence-cased raw text, so new tools still render presentably.
const LABELS: Record<string, string> = {
  terminal: 'Run command',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  patch: 'Edit',
  search: 'Search',
  extract: 'Fetch webpage',
  'web extract': 'Fetch webpage',
  'web search': 'Web search',
  delegate: 'Delegate task',
  'delegate batch': 'Delegate tasks',
  todo: 'Update TODO',
  python: 'Run Python',
  'process wait': 'Wait for process',
  'session search': 'Search sessions',
  'skills list': 'List skills',
  'skill view': 'View skill'
}

function displayName(call: ToolCall): string {
  const { action } = splitTitle(call.name)
  const label = LABELS[action]
  if (label) return label
  // Fallback-titled tools arrive as raw names ("send_message") or lowercase
  // phrases ("browser snapshot") — sentence-case them.
  const plain = action.replace(/_/g, ' ')
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

function brief(call: ToolCall, shorten: Shorten): string {
  // Paths in the detail shorten against the cwd like every other provider;
  // shell commands pass through with the familiar `$` prefix. Titles without
  // a colon detail surface the qualifier instead ("todo (4 items)" → "4
  // items", "skill view (moi-workspace)" → "moi-workspace"); when both are
  // present the qualifier is a mode ("patch (replace): a.txt") the Edit
  // label already implies, so the detail wins.
  const { action, qualifier, detail } = splitTitle(call.name)
  const text = detail || qualifier
  if (!text) return ''
  return action === 'terminal' ? `$ ${prettifyShellCommand(text)}` : shorten(text)
}

export const hermesFormatter: ToolFormatter = { displayName, brief }
