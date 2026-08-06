// Visual grouping on top of the raw `view.turns` stream. Providers serialize
// one agent run differently: Claude can mix several blocks in one assistant
// message, while Codex emits a separate item for every step. The chat renders
// consecutive assistant turns as one run so both shapes finish the same way.
import type { Turn } from '@/lib/types'

export function isVisibleChatTurn(turn: Turn): boolean {
  return (
    turn.origin.kind !== 'replay' &&
    turn.origin.kind !== 'synthetic' &&
    turn.origin.kind !== 'subagent-prompt'
  )
}

function mergeAssistantTurns(first: Turn, next: Turn): Turn {
  const meta = first.meta || next.meta ? { ...first.meta, ...next.meta } : undefined
  return {
    ...first,
    parts: [...first.parts, ...next.parts],
    timestamp: next.timestamp ?? first.timestamp,
    meta
  }
}

export function groupTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = []
  for (const t of turns) {
    if (!isVisibleChatTurn(t)) continue
    if (t.role !== 'assistant') {
      out.push(t)
      continue
    }
    const last = out.length > 0 ? out[out.length - 1] : null
    if (last?.role === 'assistant') {
      // Keep the first id as the React key while carrying the latest timestamp
      // and metadata forward for the completed run.
      out[out.length - 1] = mergeAssistantTurns(last, t)
    } else {
      out.push(t)
    }
  }
  return out
}

function timestampMs(timestamp: string | undefined): number | undefined {
  if (!timestamp) return undefined
  const value = Date.parse(timestamp)
  return Number.isFinite(value) ? value : undefined
}

export function resolveAgentRunDuration(
  previousTurn: Turn | undefined,
  turn: Turn
): number | undefined {
  if (turn.role !== 'assistant') return undefined

  if (previousTurn?.role === 'user' && previousTurn.origin.kind === 'user-input') {
    const startedAt = timestampMs(previousTurn.timestamp)
    const finishedAt = timestampMs(turn.timestamp)
    if (startedAt !== undefined && finishedAt !== undefined && finishedAt >= startedAt) {
      return finishedAt - startedAt
    }
  }

  const nativeDuration = turn.meta?.durationMs
  return typeof nativeDuration === 'number' &&
    Number.isFinite(nativeDuration) &&
    nativeDuration >= 0
    ? nativeDuration
    : undefined
}
