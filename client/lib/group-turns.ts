// Visual-grouping pass on top of the raw `view.turns` stream.
//
// Background (see `dev/turn-spacing.md`): some providers (OpenAI Codex,
// notably) serialize one assistant message per agent-loop step. A run that
// does Read → Write → Bash often arrives as four tool-only assistant turns
// with no text in between. Each turn renders as its own `<TurnView>` and
// inherits the wider inter-turn gap, which makes the chat feel sparse.
//
// This helper merges consecutive assistant turns into a single synthetic
// turn whenever they're "tool-only" — i.e. the joining turn has no `text`
// part. A turn that contains a `text` part *always* starts a new group.
// User turns, replays, and any non-assistant turn pass through unchanged.
//
// Key stability: the merged turn keeps the FIRST member's `id` (and `seq`,
// `timestamp`, `meta`, etc.). Live-stream upserts that update a member
// turn's parts (tool-result fold-in, optimistic-id rename) flow through
// without changing the merged group's key, so React's reconciliation
// updates in place. New turns appended later either join the same group
// (same key, more parts) or start a new one (their own id).
import type { Part, Turn } from '@/lib/types'

function hasText(parts: Part[]): boolean {
  return parts.some(p => p.type === 'text')
}

export function groupTurns(turns: Turn[]): Turn[] {
  const out: Turn[] = []
  for (const t of turns) {
    if (t.role !== 'assistant') {
      out.push(t)
      continue
    }
    const last = out.length > 0 ? out[out.length - 1] : null
    const canJoin = !hasText(t.parts) && last !== null && last.role === 'assistant'
    if (canJoin) {
      // Replace the last entry with a merged copy. Spread `last` first so
      // its id/timestamp/meta/origin/seq survive; only `parts` is rebuilt.
      out[out.length - 1] = { ...last, parts: [...last.parts, ...t.parts] }
    } else {
      out.push(t)
    }
  }
  return out
}
