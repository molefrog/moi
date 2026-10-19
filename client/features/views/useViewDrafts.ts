import { useCallback, useEffect, useRef } from 'react'
import { toast } from '@/client/components/ui/toast'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import { useUiStore } from '@/client/store/ui'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import { viewTabId } from '@/lib/workspace-tabs'
import type { PendingView } from '@/lib/types'

type UseViewDraftsOptions = {
  workspaceId: string
  pendingViews: PendingView[]
  onSave: (viewId: string, requirements: string) => Promise<unknown>
}

// The composer owns local text. This hook seeds server-saved requirements and
// autosaves changes without subscribing the workspace screen to keystrokes.
export function useViewDrafts({ workspaceId, pendingViews, onSave }: UseViewDraftsOptions) {
  const initializedRef = useRef(new Set<string>())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingViewsRef = useLatestRef(pendingViews)
  const onSaveRef = useLatestRef(onSave)
  const clear = useCallback(
    (viewId: string) => {
      clearTimeout(timersRef.current.get(viewId))
      timersRef.current.delete(viewId)
      useUiStore
        .getState()
        .setComposerDraft(composerDraftKey(workspaceId, draftSessionId(viewTabId(viewId))), null)
    },
    [workspaceId]
  )

  useEffect(() => {
    for (const view of pendingViews) {
      const draftId = draftSessionId(viewTabId(view.id))
      const key = composerDraftKey(workspaceId, draftId)
      useUiStore.getState().moveComposerDraft(draftId, key)
      if (view.status !== 'draft') clear(view.id)
      else if (!initializedRef.current.has(key)) {
        initializedRef.current.add(key)
        if (useUiStore.getState().composerDrafts[key] === undefined)
          useUiStore.getState().setComposerDraft(key, view.requirements)
      }
    }
  }, [workspaceId, pendingViews, clear])

  useEffect(() => {
    const timers = timersRef.current
    const saveDraft = (viewId: string) => {
      if (pendingViewsRef.current.find(view => view.id === viewId)?.status !== 'draft') return
      const key = composerDraftKey(workspaceId, draftSessionId(viewTabId(viewId)))
      const value = useUiStore.getState().composerDrafts[key]
      if (value === undefined) return
      void onSaveRef.current(viewId, value).catch(() => {
        toast.add({ title: 'Couldn’t save view description', type: 'error' })
      })
    }
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      for (const view of pendingViewsRef.current) {
        if (view.status !== 'draft') continue
        const key = composerDraftKey(workspaceId, draftSessionId(viewTabId(view.id)))
        const value = state.composerDrafts[key]
        if (value === previous.composerDrafts[key]) continue
        clearTimeout(timers.get(view.id))
        timers.delete(view.id)
        if (value === undefined) continue
        timers.set(
          view.id,
          setTimeout(() => {
            timers.delete(view.id)
            saveDraft(view.id)
          }, 500)
        )
      }
    })
    return () => {
      unsubscribe()
      // Recovery unmounts the workspace. Flush edits still in the debounce window.
      for (const [viewId, timer] of timers) {
        clearTimeout(timer)
        saveDraft(viewId)
      }
      timers.clear()
    }
  }, [workspaceId, pendingViewsRef, onSaveRef])

  return { clear }
}
