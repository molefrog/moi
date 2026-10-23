import type { SessionFork, StreamEvent } from '@/lib/types'
import { applyEvents } from '@/lib/format'

export class ForkUnsupportedError extends Error {}

export function inheritedHistoryBoundary(
  events: StreamEvent[]
): Pick<SessionFork, 'throughMessageId' | 'noticeIds'> {
  const view = applyEvents(events)
  return {
    throughMessageId: view.turns.at(-1)?.id,
    noticeIds: view.notices.map(notice => notice.id)
  }
}
