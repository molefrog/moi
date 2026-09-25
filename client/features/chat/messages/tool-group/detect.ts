// Detection heuristics for how to render a tool result. Pure, no React. The
// highlighter (sugar-high) is language-agnostic, so `label` is display-only.
import type { ToolCall } from '@/lib/types'

// File extension → a short language label for the code-block header.
const EXT_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  md: 'md',
  mdx: 'mdx',
  css: 'css',
  scss: 'scss',
  html: 'html',
  py: 'py',
  rb: 'rb',
  go: 'go',
  rs: 'rs',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  sh: 'sh',
  bash: 'sh',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  php: 'php',
  swift: 'swift',
  kt: 'kt'
}

function langForPath(path: string): string | null {
  const base = path.split(/[\\/]/).pop() ?? ''
  const i = base.lastIndexOf('.')
  const ext = i > 0 ? base.slice(i + 1).toLowerCase() : ''
  return EXT_LANG[ext] ?? null
}

// Cheap JSON guard before JSON.parse: trimmed text starts with `{`/`[` and round
// -trips. Returns the pretty-printed form, or null (skips prose without parsing).
function tryJson(text: string): string | null {
  const t = text.trim()
  if (t.length < 2 || !(t.startsWith('{') || t.startsWith('['))) return null
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return null
  }
}

// Strip Claude's `Read` cat -n gutter (`␣␣␣12\t…`) so the highlighter sees clean
// source. No-op when no line matches the gutter shape.
function stripReadGutter(text: string): string {
  const lines = text.split('\n')
  if (!lines.some(l => /^\s*\d+\t/.test(l))) return text
  return lines.map(l => l.replace(/^\s*\d+\t/, '')).join('\n')
}

// fx wraps file reads as `<path>…</path>` + `<content>…</content>` around a
// numbered listing. Unwrap to the listing so the gutter strip and highlighter
// see plain source; any other shape passes through unchanged.
function unwrapFxRead(text: string): string {
  const match = /^<path>[^\n]*<\/path>\n<content>\n([\s\S]*?)\n?<\/content>\s*$/.exec(text)
  return match ? match[1]! : text
}

export type DiffLine = { kind: 'addition' | 'deletion' | 'context'; text: string }

// 'plain' → render the raw output as-is (no switch). 'highlight' → render a
// raw ↔ <label> switch over a syntax-highlighted `code` block. 'diff' → the
// same switch over added/removed lines.
export type OutputView =
  | { kind: 'plain' }
  | { kind: 'highlight'; code: string; label: string }
  | { kind: 'diff'; lines: DiffLine[]; code: string; label: string }

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function diffView(lines: DiffLine[]): OutputView {
  const code = lines
    .map(
      line => (line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ' ') + line.text
    )
    .join('\n')
  return { kind: 'diff', lines, code, label: 'diff' }
}

// fx edits: prefer fx's own committed line diff (restored from its history),
// else the replaced/new text from the call input while the run is live.
function editDiff(call: ToolCall, input: Record<string, unknown>): OutputView | null {
  const change = record(call.sidecar?.fxFileChange)
  if (change && Array.isArray(change.lines)) {
    const lines = change.lines.flatMap((line): DiffLine[] => {
      const entry = record(line)
      if (!entry || typeof entry.text !== 'string') return []
      const kind = entry.kind === 'addition' || entry.kind === 'deletion' ? entry.kind : 'context'
      return [{ kind, text: entry.text }]
    })
    if (lines.length) return diffView(lines)
  }
  if (call.name !== 'edit_file') return null
  const before = typeof input.old_string === 'string' ? input.old_string : null
  const after = typeof input.new_string === 'string' ? input.new_string : null
  if (before === null || after === null) return null
  return diffView([
    ...before.split('\n').map(text => ({ kind: 'deletion' as const, text })),
    ...after.split('\n').map(text => ({ kind: 'addition' as const, text }))
  ])
}

// Decide how to render a tool result. Edits with a known change render as a
// diff; file read/write with a code extension wins next (reads carry content
// in the output, writes in the input); otherwise a JSON-looking output;
// otherwise plain text.
export function detectOutput(call: ToolCall, output: string): OutputView {
  const input = (call.input as Record<string, unknown>) ?? {}
  const path =
    typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.path === 'string'
        ? input.path
        : ''
  const lang = path ? langForPath(path) : null

  // A new file reads best as highlighted source; changes to existing files
  // (or unknown file types) read best as a diff.
  const added = record(call.sidecar?.fxFileChange)?.kind === 'added'
  const diff = added && lang ? null : editDiff(call, input)
  if (diff) return diff

  const isRead = call.name === 'Read' || call.name === 'read' || call.name === 'read_file'
  const isWrite = call.name === 'Write' || call.name === 'write' || call.name === 'write_file'
  if (lang && isRead && output)
    return { kind: 'highlight', code: stripReadGutter(unwrapFxRead(output)), label: lang }
  if (lang && isWrite && typeof input.content === 'string' && input.content)
    return { kind: 'highlight', code: input.content, label: lang }

  const pretty = tryJson(output)
  if (pretty) return { kind: 'highlight', code: pretty, label: 'json' }

  return { kind: 'plain' }
}
