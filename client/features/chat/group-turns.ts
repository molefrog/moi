// Visual grouping on top of the raw `view.turns` stream. Providers serialize
// one agent run differently: Claude can mix several blocks in one assistant
// message, while Codex emits a separate item for every step. The chat renders
// consecutive assistant turns as one run so both shapes finish the same way.
import type { Turn } from '@/lib/types'

function isVisibleChatTurn(turn: Turn): boolean {
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

// Saved history is already grouped. A token update only changes its trailing
// assistant run; all completed rows keep their identities for React.memo.
export function appendPreviewTurn(grouped: Turn[], preview: Turn | null | undefined): Turn[] {
  if (!preview) return grouped
  const last = grouped.at(-1)
  if (last?.role === 'assistant') {
    return [...grouped.slice(0, -1), mergeAssistantTurns(last, preview)]
  }
  return [...grouped, preview]
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
  return out.map((turn, index) => {
    const previous = out[index - 1]
    if (
      turn.role !== 'assistant' ||
      previous?.role !== 'user' ||
      previous.origin.kind !== 'user-input' ||
      !previous.timestamp ||
      !turn.timestamp
    ) {
      return turn
    }

    const startedAt = Date.parse(previous.timestamp)
    const finishedAt = Date.parse(turn.timestamp)
    if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) {
      return turn
    }

    return { ...turn, meta: { ...turn.meta, durationMs: finishedAt - startedAt } }
  })
}
