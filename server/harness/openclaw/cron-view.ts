// Cold-path view synthesis for isolated cron sessions.
//
// Why this exists: `sessions.list` shows a cron job under its bucket key
// (`agent:<id>:cron:<jobId>`), but each scheduled run executes in a per-run
// session (`…:cron:<jobId>:run:<uuid>`) and the gateway's post-run session
// reset orphans that per-run transcript file. `sessions.get` on the listed
// bucket key therefore returns ZERO messages (verified live on 2026.7.1), so
// opening a cron chat would render empty. The run-history RPC (`cron.runs`,
// present with identical params/response on both supported lines, 2026.7.x
// and 2026.6.x) still records each run's outcome — we synthesize one
// assistant turn per recorded run from it.
import type { StreamEvent, Turn, TurnMeta } from '@/lib/format'

// One `cron.runs` entry (subset). Shape verified against a live 2026.7.1
// gateway; note usage keys are snake_case here, unlike session-message usage.
export type OpenClawCronRunEntry = {
  ts: number
  jobId: string
  status?: string
  error?: string
  summary?: string
  runId?: string
  runAtMs?: number
  durationMs?: number
  model?: string
  provider?: string
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  sessionId?: string
  sessionKey?: string
  jobName?: string
}

// `agent:main:cron:<jobId>` (bucket) or `…:cron:<jobId>:run:<uuid>` → jobId.
export function openClawCronJobIdFromKey(key: string): string | null {
  const m = /:cron:([^:]+)/.exec(key)
  return m ? m[1] : null
}

// One assistant turn per recorded run, ascending by run time. Text is the
// run's reply summary; failed runs without a summary show the error, and
// runs with neither (skipped, timed out before output) still get a status
// line so the chat never renders empty while runs exist.
export function cronRunsToStreamEvents(entries: OpenClawCronRunEntry[]): StreamEvent[] {
  const events: StreamEvent[] = []
  for (const entry of [...entries].sort((a, b) => a.ts - b.ts)) {
    const text =
      entry.summary?.trim() ||
      (entry.error ? `⚠ ${entry.error}` : entry.status ? `(run ${entry.status})` : '')
    if (!text) continue
    const meta: TurnMeta = {}
    if (entry.model) meta.model = entry.model
    if (entry.provider) meta.provider = entry.provider
    if (entry.status) meta.stopReason = entry.status
    if (entry.usage) {
      const usage: NonNullable<TurnMeta['usage']> = {}
      if (typeof entry.usage.input_tokens === 'number') usage.inputTokens = entry.usage.input_tokens
      if (typeof entry.usage.output_tokens === 'number') {
        usage.outputTokens = entry.usage.output_tokens
      }
      if (typeof entry.usage.total_tokens === 'number') usage.totalTokens = entry.usage.total_tokens
      if (Object.keys(usage).length > 0) meta.usage = usage
    }
    const turn: Turn = {
      id: `openclaw:cron:${entry.jobId}:${entry.runId ?? entry.ts}`,
      role: 'assistant',
      origin: { kind: 'user-input' },
      parts: [{ type: 'text', text }],
      timestamp: new Date(entry.ts).toISOString(),
      ...(Object.keys(meta).length > 0 ? { meta } : {})
    }
    events.push({ kind: 'turn', turn })
  }
  return events
}
