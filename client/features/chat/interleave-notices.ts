// Weaves transcript notices (context compaction, mid-session model switches)
// into the turn list so each one reads at the moment it happened.
//
// Only 'compact' and 'model-change' render today. Every other SystemNotice
// kind is claude-code-specific plumbing with no designed chat treatment yet,
// so `chatNoticeLabel` skips it explicitly.
import type { SystemNotice, Turn } from '@/lib/types'

export type ChatTimelineItem =
  | { kind: 'turn'; turn: Turn }
  | { kind: 'notice'; notice: SystemNotice }

// One-line copy for a notice row; null = this kind does not render in chat.
export function chatNoticeLabel(notice: SystemNotice): string | null {
  switch (notice.kind) {
    case 'compact':
      return 'Context compacted'
    case 'model-change':
      return notice.prev
        ? `Model changed to ${notice.model} (was ${notice.prev})`
        : `Model changed to ${notice.model}`
    // Claude-code-specific notices without a designed chat treatment yet —
    // skipped on purpose. New kinds stay hidden until designed.
    case 'rate-limit':
    case 'api-retry':
    case 'hook':
    case 'session-state':
    case 'files-persisted':
    case 'elicitation':
    default:
      return null
  }
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) return undefined
  const time = Date.parse(value)
  return Number.isNaN(time) ? undefined : time
}

// Merge renderable notices into the turn stream chronologically: a notice
// lands before the first turn strictly newer than its `at`. Turns keep their
// original order; a turn without a timestamp inherits the previous turn's, so
// notices never jump ahead of undated turns. Notices with no parseable `at`
// have no comparable anchor and go after the last turn.
//
// Known limitation — a transcript whose turns are ALL undated gives nothing to
// compare against, so every dated notice lands after the last turn. That is
// right while a session is live (compaction happens at the current end of the
// conversation) but drifts on replay: the notice follows the new end instead of
// staying where it happened. Codex hits this today — `codexItemToTurn` sets no
// `timestamp` and `codexItemToNotice` stamps `at` with replay-time `new Date()`
// — so fixing it means giving those rows a real anchor, not changing the merge.
export function interleaveNotices(turns: Turn[], notices: SystemNotice[]): ChatTimelineItem[] {
  const shown = notices.filter(notice => chatNoticeLabel(notice) !== null)
  if (shown.length === 0) return turns.map((turn): ChatTimelineItem => ({ kind: 'turn', turn }))

  const dated: { notice: SystemNotice; time: number }[] = []
  const anchorless: SystemNotice[] = []
  for (const notice of shown) {
    const time = parseTime(notice.at)
    if (time === undefined) anchorless.push(notice)
    else dated.push({ notice, time })
  }
  dated.sort((a, b) => a.time - b.time)

  const out: ChatTimelineItem[] = []
  let next = 0
  let turnTime = Number.NEGATIVE_INFINITY
  for (const turn of turns) {
    turnTime = Math.max(turnTime, parseTime(turn.timestamp) ?? turnTime)
    // `<=`: a notice stamped with the turn's own timestamp announces that
    // turn (model-change carries the switching turn's time) and must render
    // before it.
    while (next < dated.length && dated[next].time <= turnTime) {
      out.push({ kind: 'notice', notice: dated[next].notice })
      next += 1
    }
    out.push({ kind: 'turn', turn })
  }
  for (; next < dated.length; next += 1) out.push({ kind: 'notice', notice: dated[next].notice })
  for (const notice of anchorless) out.push({ kind: 'notice', notice })
  return out
}
