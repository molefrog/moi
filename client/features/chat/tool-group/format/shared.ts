// Shared plumbing for the per-provider tool-row formatters. Pure functions,
// no React.
import { relative } from 'pathe'

import type { ToolCall } from '@/lib/types'

export type Shorten = (s: string) => string

// A provider's contribution to a tool row: the user-facing label and the gray
// one-line brief beside it. One implementation per provider vocabulary
// (claude.ts, openclaw.ts, codex.ts, hermes.ts); index.ts dispatches on
// `call.provider`.
export type ToolFormatter = {
  displayName: (call: ToolCall) => string
  brief: (call: ToolCall, shorten: Shorten) => string
}

export function toolInput(call: ToolCall): Record<string, unknown> {
  return (call.input as Record<string, unknown>) ?? {}
}

export function getInputValue(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  return typeof value === 'string' ? value : ''
}

export function makeShortenPaths(cwd: string | null): Shorten {
  return s =>
    s.replace(/\/[^\s"']+/g, p => {
      if (!cwd) return p
      const rel = relative(cwd, p)
      return rel.startsWith('..') ? p : rel
    })
}

// Compact wall-clock duration in whole seconds: under a minute → "3s", longer
// → "1m 5s". Used on agent-run and subagent duration labels.
//
// Never milliseconds. A column of "Thought for 514ms" / "Thought for 784ms"
// rows reads as jitter — the exact figure is noise at this size, and the
// varying width makes the list look ragged next to a plain "Thought for 1s".
// Sub-second durations round UP so a real pause never renders as "0s".
export function formatDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m}m ${rem}s` : `${m}m`
}
