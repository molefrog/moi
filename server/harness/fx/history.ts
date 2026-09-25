// Reads fx's own saved history for a chat. ACP clips every tool result to a
// 200-byte preview (live and on `session/load`), so shell output and file
// changes are otherwise lost. `fx session --id <id> --json` is fx's supported
// history interface and keeps the complete result.

// One saved tool result, keyed by its ACP toolCallId.
export type FxToolHistory = {
  status: 'success' | 'failure'
  // The complete result text the model received.
  output: string
  // Shell results: the command's own output, separate from fx's envelope.
  shell?: {
    output: string
    exitCode: number | null
    signal: number | null
    state?: string
    sessionId?: string | null
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

function shellResult(output: string): FxToolHistory['shell'] {
  let envelope: Record<string, unknown> | undefined
  try {
    envelope = record(JSON.parse(output))
  } catch {
    return undefined
  }
  if (!envelope || typeof envelope.state !== 'string') return undefined
  return {
    output: typeof envelope.output_delta === 'string' ? envelope.output_delta : '',
    exitCode: integerOrNull(envelope.exit_code),
    signal: integerOrNull(envelope.signal),
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
  sidecar?: Record<string, unknown>
}

// Map saved results to row updates. A command still running in the background
// keeps its live stream, which is newer than any saved snapshot.
export function fxToolEnrichments(
  history: Map<string, FxToolHistory>
): Map<string, FxToolEnrichment> {
  const enrichments = new Map<string, FxToolEnrichment>()
  for (const [id, result] of history) {
    if (result.shell) {
      if (result.shell.state === 'running') continue
      enrichments.set(id, {
        ...(result.shell.output ? { output: capped(result.shell.output) } : {}),
        sidecar: {
          fxShell: {
            exitCode: result.shell.exitCode,
            signal: result.shell.signal,
            ...(result.shell.sessionId ? { sessionId: result.shell.sessionId } : {})
          }
        }
      })
      continue
    }
    enrichments.set(id, {
      output: capped(result.output),
      ...(result.file ? { sidecar: { fxFileChange: result.file } } : {})
    })
  }
  return enrichments
}
