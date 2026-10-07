import type { SessionRecord, ViewState } from '@/lib/types'

export function visibleForkHistory(view: ViewState, session?: SessionRecord): ViewState {
  if (!session?.forkedFromSessionId || !session.forkedThroughMessageId) return view
  const cutoff = session.forkedThroughMessageId
  const index = view.turns.findIndex(turn => turn.id === cutoff)
  if (index < 0) return view
  const forkedNoticeIds = new Set(session.forkedNoticeIds)
  return {
    ...view,
    turns: view.turns.slice(index + 1),
    notices: view.notices.filter(notice => !forkedNoticeIds.has(notice.id))
  }
}
