import type { SessionFork, ViewState } from '@/lib/types'

export function visibleForkHistory(view: ViewState, fork?: SessionFork): ViewState {
  if (!fork?.throughMessageId) return view
  const cutoff = fork.throughMessageId
  const index = view.turns.findIndex(turn => turn.id === cutoff)
  if (index < 0) return view
  const forkedNoticeIds = new Set(fork.noticeIds)
  return {
    ...view,
    turns: view.turns.slice(index + 1),
    notices: view.notices.filter(notice => !forkedNoticeIds.has(notice.id))
  }
}
