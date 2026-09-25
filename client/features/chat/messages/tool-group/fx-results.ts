// fx returns several tool results in envelopes written for the model: JSON
// for subagents and vision, tagged text for web fetches, skills and saved
// command output, and a `[glob]`/`[grep]` header line for file searches. Parse
// them into what a row shows: a readable body and a one-line summary. Shapes
// that do not match (including a result still clipped to its live preview)
// return null and render as returned. Pure, no React.
import type { ToolCall } from '@/lib/types'

export type FxResultBody = {
  kind: 'markdown' | 'text' | 'highlight'
  text: string
  // The switch label beside "raw" in the output header.
  label: string
}

export type FxResult = { body?: FxResultBody; summary?: string }

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
}

function parseJson(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return undefined
  try {
    return record(JSON.parse(trimmed))
  } catch {
    return undefined
  }
}

function attributes(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// `ModelUnavailable` or `model_unavailable` → "Model unavailable".
function humanizeCode(code: string): string {
  return capitalize(
    code
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .toLowerCase()
  )
}

function shorten(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// `{"ok":true,"result":"<markdown report>","error_code":null}`
function subagentResult(output: string): FxResult | null {
  const value = parseJson(output)
  if (!value || typeof value.ok !== 'boolean') return null
  const report = typeof value.result === 'string' ? value.result.trim() : ''
  const summary =
    value.pending === true
      ? 'Running in the background'
      : !value.ok && typeof value.error_code === 'string' && value.error_code
        ? humanizeCode(value.error_code)
        : undefined
  return {
    ...(report ? { body: { kind: 'markdown', text: report, label: 'report' } } : {}),
    ...(summary ? { summary } : {})
  }
}

// `{"images":[{"summary":"…","visible_text":["…"],"details":["…"]}]}`
function visionResult(output: string): FxResult | null {
  const images = parseJson(output)?.images
  if (!Array.isArray(images) || images.length === 0) return null
  const sections = images.flatMap((image, index) => {
    const entry = record(image)
    if (!entry) return []
    const heading = images.length > 1 ? [`**Image ${index + 1}**`] : []
    const summary = typeof entry.summary === 'string' ? [entry.summary.trim()] : []
    const details = strings(entry.details).map(detail => `- ${detail.trim()}`)
    const lines = [...heading, ...summary, ...(details.length ? [details.join('\n')] : [])]
    return lines.length ? [lines.join('\n\n')] : []
  })
  const visible = images.flatMap(image => strings(record(image)?.visible_text))
  return {
    ...(sections.length
      ? { body: { kind: 'markdown', text: sections.join('\n\n'), label: 'text' } }
      : {}),
    ...(visible.length ? { summary: shorten(`Visible text: ${visible.join(', ')}`) } : {})
  }
}

function tagValue(text: string, name: string): string | undefined {
  return new RegExp(`^<${name}>([^\\n]*)</${name}>$`, 'm').exec(text)?.[1]
}

// A preamble line, one `<field>value</field>` line per detail, then the page
// (converted to markdown for HTML) inside `<content>`.
function webFetchResult(output: string): FxResult | null {
  if (!output.startsWith('Web fetch result.')) return null
  const content = /\n<content>\n?([\s\S]*?)\n?<\/content>\s*$/.exec(output)?.[1]
  if (content === undefined) return null
  const status = tagValue(output, 'status')
  const mime = tagValue(output, 'mime_type')
  const cached = tagValue(output, 'cache_hit') === 'true'
  const summary = [status, mime, cached ? 'cached' : ''].filter(Boolean).join(' · ')
  return {
    ...(content.trim() ? { body: { kind: 'text', text: content.trim(), label: 'content' } } : {}),
    ...(summary ? { summary } : {})
  }
}

// `<skill_content name="…" location="…" resource="SKILL.md" complete="true">…`
function skillResult(output: string): FxResult | null {
  const match = /^<skill_content\b([^>]*)>\n?([\s\S]*?)\n?<\/skill_content>\s*$/.exec(output)
  if (!match) return null
  const attrs = attributes(match[1]!)
  const resource = attrs.resource ?? ''
  const label = /\.mdx?$/i.test(resource) || !resource ? 'md' : 'text'
  return {
    body: { kind: label === 'md' ? 'highlight' : 'text', text: match[2]!, label },
    ...(attrs.complete === 'false' ? { summary: 'Shortened by fx' } : {})
  }
}

// Saved command output, read back by byte range. Control bytes inside each
// `[stdout]`/`[stderr]` block are escaped as `\xNN`.
function commandOutputResult(output: string): FxResult | null {
  const match = /^<command_output\b([^>]*)>\n?([\s\S]*?)\n?<\/command_output>\s*$/.exec(output)
  if (!match) return null
  const attrs = attributes(match[1]!)
  const streams = [...match[2]!.matchAll(/\[(stdout|stderr)\]\n?([\s\S]*?)\n?\[\/\1\]/g)]
  const text = streams
    .map(stream =>
      stream[2]!.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      )
    )
    .join('')
  const range =
    attrs.start_byte && attrs.end_byte && attrs.total_bytes
      ? `Bytes ${attrs.start_byte}–${attrs.end_byte} of ${attrs.total_bytes}`
      : undefined
  return {
    ...(text ? { body: { kind: 'text', text, label: 'output' } } : {}),
    ...(range ? { summary: range } : {})
  }
}

// `[glob] no matches for src/*`, or a count header followed by ` - path` lines.
function searchResult(output: string): FxResult | null {
  const [header = '', ...rest] = output.split('\n')
  const match = /^\[(?:glob|grep)\] (.+)$/.exec(header.trim())
  if (!match) return null
  const lines = rest.map(line => line.replace(/^\s*- /, '')).filter(line => line.trim())
  return {
    summary: capitalize(match[1]!.trim()),
    ...(lines.length ? { body: { kind: 'text', text: lines.join('\n'), label: 'results' } } : {})
  }
}

export function parseFxResult(call: ToolCall, output: string): FxResult | null {
  if (!output) return null
  switch (call.name) {
    case 'subagent':
      return subagentResult(output)
    case 'vision':
      return visionResult(output)
    case 'web_fetch':
      return webFetchResult(output)
    case 'skill':
      return skillResult(output)
    case 'read_tool_result':
      return commandOutputResult(output)
    case 'glob_files':
    case 'grep_files':
      return searchResult(output)
    default:
      return null
  }
}
