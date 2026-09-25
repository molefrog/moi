// Reads fx's own saved history for a chat. ACP clips every tool result to a
// 200-byte preview (live and on `session/load`), so shell output and file
// changes are otherwise lost. `fx session --id <id> --json` is fx's supported
// history interface. It keeps up to 4,096 bytes of each result, which covers
// most results; a longer one arrives cut, a shell envelope mid-JSON.
import type { ToolCall } from '@/lib/types'
import { FX_HISTORY_PREVIEW_ONLY, FX_NO_OUTPUT, FX_STATUS_LINE } from '@/lib/fx-shell-status'

import { errorEnvelopeText } from './adapter'

// One saved tool result, keyed by its ACP toolCallId.
export type FxToolHistory = {
  status: 'success' | 'failure'
  // The complete result text the model received.
  output: string
  // Shell results: the command's own output, separate from fx's envelope.
  // `partial` marks output recovered from an envelope fx saved only in part.
  shell?: {
    output: string
    exitCode: number | null
    signal: number | null
    state?: string
    sessionId?: string | null
    durationMs?: number
    partial?: boolean
  }
  // Committed write/edit results: fx's own line diff of the change.
  file?: FxFileChange
}

export type FxFileChange = {
  path: string
  kind: string
  additions: number
  deletions: number
  truncated: boolean
  lines: { kind: 'addition' | 'deletion' | 'context'; text: string }[]
}

type FxHistoryOptions = {
  cwd: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function integerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

// Decode a JSON string body cut at an arbitrary byte: drop the partial
// escape sequence (at most `\uXXX`) the cut may have split.
function decodeCutString(raw: string): string {
  for (let trim = 0; trim <= 6 && trim <= raw.length; trim++) {
    try {
      return JSON.parse(`"${raw.slice(0, raw.length - trim)}"`) as string
    } catch {}
  }
  return ''
}

const SHELL_PREFIX = /^\{"session_id":(null|"[^"]*"),"state":"(\w+)","backend":/

// A shell envelope cut by fx's 4,096-byte cap. Its status fields precede
// `output_delta`, so they survive; the output is decoded up to the cut.
function partialShellResult(output: string): FxToolHistory['shell'] {
  const prefix = SHELL_PREFIX.exec(output)
  if (!prefix) return undefined
  const deltaAt = output.indexOf('"output_delta":"')
  const head = deltaAt < 0 ? output : output.slice(0, deltaAt)
  const field = (key: string) => {
    const match = new RegExp(`"${key}":(-?\\d+)`).exec(head)
    return match ? Number(match[1]) : null
  }
  const raw = deltaAt < 0 ? '' : output.slice(deltaAt + '"output_delta":"'.length)
  return {
    output: decodeCutString(raw),
    exitCode: field('exit_code'),
    signal: field('signal'),
    ...(field('duration_ms') !== null ? { durationMs: field('duration_ms')! } : {}),
    state: prefix[2],
    sessionId: prefix[1] === 'null' ? null : prefix[1]!.slice(1, -1),
    partial: true
  }
}

function shellResult(output: string): FxToolHistory['shell'] {
  let envelope: Record<string, unknown> | undefined
  try {
    envelope = record(JSON.parse(output))
  } catch {
    return partialShellResult(output)
  }
  if (!envelope || typeof envelope.state !== 'string') return undefined
  return {
    output: typeof envelope.output_delta === 'string' ? envelope.output_delta : '',
    exitCode: integerOrNull(envelope.exit_code),
    signal: integerOrNull(envelope.signal),
    ...(integerOrNull(envelope.duration_ms) !== null
      ? { durationMs: integerOrNull(envelope.duration_ms)! }
      : {}),
    state: envelope.state,
    sessionId: typeof envelope.session_id === 'string' ? envelope.session_id : null
  }
}

function fileChange(value: unknown): FxFileChange | undefined {
  const presentation = record(value)
  if (!presentation || typeof presentation.path !== 'string') return undefined
  const lines = array(presentation.lines).flatMap(entry => {
    const line = record(entry)
    if (!line || typeof line.text !== 'string') return []
    const kind =
      line.kind === 'addition' ? 'addition' : line.kind === 'deletion' ? 'deletion' : 'context'
    return [{ kind, text: line.text } as const]
  })
  return {
    path: presentation.path,
    kind: typeof presentation.kind === 'string' ? presentation.kind : 'edited',
    additions: integerOrNull(presentation.additions) ?? 0,
    deletions: integerOrNull(presentation.deletions) ?? 0,
    truncated: presentation.truncated === true,
    lines
  }
}

// Parse `fx session --id <id> --json` into tool results by call id. Unknown
// shapes yield an empty map: enrichment is best effort and never blocks a chat.
export function parseFxToolHistory(json: unknown): Map<string, FxToolHistory> {
  const results = new Map<string, FxToolHistory>()
  for (const turn of array(record(json)?.history)) {
    const execution = record(record(turn)?.execution)
    for (const step of array(execution?.tool_steps)) {
      const names = new Map<string, string>()
      for (const call of array(record(step)?.tool_calls)) {
        const entry = record(call)
        if (typeof entry?.id === 'string' && typeof entry.name === 'string')
          names.set(entry.id, entry.name)
      }
      for (const result of array(record(step)?.tool_results)) {
        const entry = record(result)
        const id = entry?.tool_call_id
        if (!entry || typeof id !== 'string' || typeof entry.output !== 'string') continue
        const name = typeof entry.tool_name === 'string' ? entry.tool_name : names.get(id)
        const shell = name === 'shell' ? shellResult(entry.output) : undefined
        const file = fileChange(entry.committed_file_presentation)
        results.set(id, {
          status: entry.status === 'success' ? 'success' : 'failure',
          output: entry.output,
          ...(shell ? { shell } : {}),
          ...(file ? { file } : {})
        })
      }
    }
  }
  return results
}

export async function readFxToolHistory(
  command: string,
  sessionId: string,
  options: FxHistoryOptions
): Promise<Map<string, FxToolHistory>> {
  const proc = Bun.spawn([command, 'session', '--id', sessionId, '--json'], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, FX_AUTO_UPGRADE: '0' },
    stdout: 'pipe',
    stderr: 'ignore'
  })
  const timeout = setTimeout(() => proc.kill('SIGKILL'), options.timeoutMs ?? 10_000)
  try {
    const [output, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (code !== 0) return new Map()
    return parseFxToolHistory(JSON.parse(output))
  } catch {
    return new Map()
  } finally {
    clearTimeout(timeout)
  }
}

// A compact unified-diff body for display ("+ added", "- removed", "  kept").
export function fxFileChangeText(change: FxFileChange): string {
  const body = change.lines
    .map(line =>
      line.kind === 'addition'
        ? `+${line.text}`
        : line.kind === 'deletion'
          ? `-${line.text}`
          : ` ${line.text}`
    )
    .join('\n')
  return change.truncated ? `${body}\n… (diff truncated by fx)` : body
}

// Full output is capped so one enormous result cannot bloat the transcript.
const MAX_OUTPUT_CHARS = 64_000

function capped(text: string): string {
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (output shortened by moi)`
    : text
}

export type FxToolEnrichment = {
  output?: string
  errorText?: string
  sidecar?: Record<string, unknown>
}

// What a row shows today, if it is more than an fx status sentence.
function rowText(call: ToolCall | undefined): string {
  const text = call?.state === 'error' ? (call.errorText ?? call.output) : call?.output
  return typeof text === 'string' ? text : ''
}

// Map saved results to changes for the rows in `calls`. A shell row keeps
// output it streamed live: that stream is complete and newer, while fx saves
// at most 4,096 bytes and can interleave stdout and stderr mid-line. Saved
// shell output fills only a row that has none of its own (a cold load).
export function fxToolEnrichments(
  history: Map<string, FxToolHistory>,
  calls: readonly ToolCall[] = []
): Map<string, FxToolEnrichment> {
  const rows = new Map(calls.map(call => [call.toolCallId, call]))
  const enrichments = new Map<string, FxToolEnrichment>()
  for (const [id, result] of history) {
    const row = rows.get(id)
    if (result.shell) {
      const shell = result.shell
      const shown = rowText(row)
      const fill = shown === '' || FX_STATUS_LINE.test(shown)
      const text = !fill
        ? ''
        : shell.partial && shell.output
          ? `${shell.output}\n… (fx saved only part of this output)`
          : shell.output ||
            // fx saved the whole result and the command printed nothing.
            (shown === FX_HISTORY_PREVIEW_ONLY && !shell.partial ? FX_NO_OUTPUT : '')
      const output = text ? { output: capped(text) } : {}
      const errorText = text && row?.state === 'error' ? { errorText: capped(text) } : {}
      // A command still running in the background has no outcome yet.
      if (shell.state === 'running') {
        if (text) enrichments.set(id, { ...output, ...errorText })
        continue
      }
      enrichments.set(id, {
        ...output,
        ...errorText,
        sidecar: {
          fxShell: {
            exitCode: shell.exitCode,
            signal: shell.signal,
            ...(shell.durationMs !== undefined ? { durationMs: shell.durationMs } : {}),
            ...(shell.sessionId ? { sessionId: shell.sessionId } : {})
          }
        }
      })
      continue
    }
    if (result.status === 'failure') {
      // The row already shows fx's error sentence; the saved copy is the
      // `{"error":…}` envelope it came from.
      const failure = errorEnvelopeText(result.output)
      if (failure) enrichments.set(id, { errorText: failure.message })
      else if (!result.output.startsWith('{"error"'))
        enrichments.set(id, { errorText: capped(result.output) })
      continue
    }
    enrichments.set(id, {
      output: capped(result.output),
      ...(result.file ? { sidecar: { fxFileChange: result.file } } : {})
    })
  }
  return enrichments
}
