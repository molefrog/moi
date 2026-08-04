import { describe, expect, test } from 'bun:test'

import type { OpenClawCronRunEntry } from './cron-view'
import { cronRunsToStreamEvents, openClawCronJobIdFromKey } from './cron-view'

// Real `cron.runs` entries captured from a live 2026.7.1 gateway (job
// 5599083d-…, probe run). Newest-first, as the RPC returns by default.
const realEntries: OpenClawCronRunEntry[] = [
  {
    ts: 1785861476576,
    jobId: '5599083d-8bb6-48c0-a74b-b1176f31866e',
    status: 'ok',
    summary: 'cron probe OK.',
    runId: 'manual:5599083d-8bb6-48c0-a74b-b1176f31866e:1785861472463:2',
    runAtMs: 1785861472463,
    durationMs: 4109,
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    usage: { input_tokens: 2, output_tokens: 9, total_tokens: 33168 },
    sessionId: 'e15f175a-26b1-4809-b140-3cd03c99b1cc',
    sessionKey:
      'agent:main:cron:5599083d-8bb6-48c0-a74b-b1176f31866e:run:07b470d0-0afc-4d59-98a9-94012397bf5a',
    jobName: 'moi-cron-probe'
  },
  {
    ts: 1785861457121,
    jobId: '5599083d-8bb6-48c0-a74b-b1176f31866e',
    status: 'error',
    error:
      'Channel is required (no configured channels detected). Run openclaw channels add to configure one.',
    summary: 'cron probe OK.',
    runId: 'manual:5599083d-8bb6-48c0-a74b-b1176f31866e:1785861451855:1',
    runAtMs: 1785861451856,
    durationMs: 5245,
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    usage: { input_tokens: 2, output_tokens: 9, total_tokens: 33227 },
    sessionId: '7a1093c9-7d22-4953-89fc-f0c1ef3e9648',
    sessionKey:
      'agent:main:cron:5599083d-8bb6-48c0-a74b-b1176f31866e:run:fdb0f26e-6c8c-486f-9250-4fe5ba55ee23',
    jobName: 'moi-cron-probe'
  }
]

describe('openClawCronJobIdFromKey', () => {
  test('extracts the job id from bucket and per-run keys', () => {
    expect(openClawCronJobIdFromKey('agent:main:cron:5599083d-8bb6-48c0-a74b-b1176f31866e')).toBe(
      '5599083d-8bb6-48c0-a74b-b1176f31866e'
    )
    expect(openClawCronJobIdFromKey(realEntries[0].sessionKey ?? '')).toBe(
      '5599083d-8bb6-48c0-a74b-b1176f31866e'
    )
  })

  test('returns null for non-cron keys', () => {
    expect(openClawCronJobIdFromKey('agent:main:main')).toBeNull()
    expect(openClawCronJobIdFromKey('agent:main:subagent:93a70592')).toBeNull()
  })
})

describe('cronRunsToStreamEvents', () => {
  test('synthesizes one assistant turn per run, ascending by time', () => {
    const events = cronRunsToStreamEvents(realEntries)
    expect(events).toHaveLength(2)
    const turns = events.map(e => (e.kind === 'turn' ? e.turn : null))
    expect(turns[0]?.timestamp).toBe(new Date(1785861457121).toISOString())
    expect(turns[1]?.timestamp).toBe(new Date(1785861476576).toISOString())
    expect(turns[1]).toMatchObject({
      id: 'openclaw:cron:5599083d-8bb6-48c0-a74b-b1176f31866e:manual:5599083d-8bb6-48c0-a74b-b1176f31866e:1785861472463:2',
      role: 'assistant',
      parts: [{ type: 'text', text: 'cron probe OK.' }],
      meta: {
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        stopReason: 'ok',
        usage: { inputTokens: 2, outputTokens: 9, totalTokens: 33168 }
      }
    })
  })

  test('a run summary wins over its error; error-only runs show the error', () => {
    const events = cronRunsToStreamEvents(realEntries)
    const failed = events[0]
    expect(failed.kind === 'turn' && failed.turn.parts[0]).toEqual({
      type: 'text',
      text: 'cron probe OK.'
    })

    const errorOnly = cronRunsToStreamEvents([
      { ts: 5, jobId: 'j', status: 'error', error: 'model preflight failed' }
    ])
    expect(errorOnly[0].kind === 'turn' && errorOnly[0].turn.parts[0]).toEqual({
      type: 'text',
      text: '⚠ model preflight failed'
    })
    expect(errorOnly[0].kind === 'turn' ? errorOnly[0].turn.meta?.stopReason : undefined).toBe(
      'error'
    )
  })

  test('status-only entries render a status line, truly empty ones skip', () => {
    const events = cronRunsToStreamEvents([{ ts: 1, jobId: 'j', status: 'skipped' }])
    expect(events).toHaveLength(1)
    expect(events[0].kind === 'turn' && events[0].turn.parts[0]).toMatchObject({
      type: 'text',
      text: '(run skipped)'
    })
    expect(cronRunsToStreamEvents([{ ts: 2, jobId: 'j' }])).toHaveLength(0)
  })
})
