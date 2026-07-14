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

// 'plain' → render the raw output as-is (no switch). 'highlight' → render a
// raw ↔ <label> switch over a syntax-highlighted `code` block.
export type OutputView = { kind: 'plain' } | { kind: 'highlight'; code: string; label: string }

// Decide how to render a tool result. File read/write with a code extension wins
// (reads carry content in the output, writes in the input); otherwise a
// JSON-looking output; otherwise plain text.
export function detectOutput(call: ToolCall, output: string): OutputView {
  const input = (call.input as Record<string, unknown>) ?? {}
  const path =
    typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.path === 'string'
        ? input.path
        : ''
  const lang = path ? langForPath(path) : null

  const isRead = call.name === 'Read' || call.name === 'read'
  const isWrite = call.name === 'Write' || call.name === 'write'
  if (lang && isRead && output)
    return { kind: 'highlight', code: stripReadGutter(output), label: lang }
  if (lang && isWrite && typeof input.content === 'string' && input.content)
    return { kind: 'highlight', code: input.content, label: lang }

  const pretty = tryJson(output)
  if (pretty) return { kind: 'highlight', code: pretty, label: 'json' }

  return { kind: 'plain' }
}
