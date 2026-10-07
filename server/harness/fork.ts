import type { StreamEvent } from '@/lib/types'
import { applyEvents } from '@/lib/format'

export class ForkUnsupportedError extends Error {}

export function inheritedHistoryBoundary(events: StreamEvent[]) {
  const view = applyEvents(events)
  return {
    forkedThroughMessageId: view.turns.at(-1)?.id,
    forkedNoticeIds: view.notices.map(notice => notice.id)
  }
}
