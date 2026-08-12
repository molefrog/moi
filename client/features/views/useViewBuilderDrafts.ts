import { useCallback, useEffect, useRef } from 'react'

import { toast } from '@/client/components/ui/toast'
import { useUiStore } from '@/client/store/ui'
import type { ViewBuilder } from '@/lib/types'

type UseViewBuilderDraftsOptions = {
  builders: ViewBuilder[]
  onSave: (builderId: string, requirements: string) => Promise<unknown>
}

// Builder draft text lives in the UI store and is subscribed from the
// composer, so a keystroke re-renders only the composer — never the workspace
// screen with its tab bar, widgets, mounted views, and builder canvases. This
// hook owns the writes: the store update, the debounced server save, and the
// cleanup when a builder leaves its draft state.
export function useViewBuilderDrafts({ builders, onSave }: UseViewBuilderDraftsOptions) {
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const buildersRef = useRef(builders)
  const onSaveRef = useRef(onSave)
  buildersRef.current = builders
  onSaveRef.current = onSave

  const clear = useCallback((builderId: string) => {
    const timer = timersRef.current.get(builderId)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(builderId)
    useUiStore.getState().setViewBuilderDraft(builderId, null)
  }, [])

  const change = useCallback((builderId: string, value: string) => {
    useUiStore.getState().setViewBuilderDraft(builderId, value)
    const existing = timersRef.current.get(builderId)
    if (existing) clearTimeout(existing)
    timersRef.current.set(
      builderId,
      setTimeout(() => {
        timersRef.current.delete(builderId)
        const builder = buildersRef.current.find(candidate => candidate.id === builderId)
        if (!builder || builder.status !== 'draft') return
        void onSaveRef.current(builderId, value).catch(() => {
          toast.add({ title: 'Couldn’t save view description', type: 'error' })
        })
      }, 500)
    )
  }, [])

  // Drop drafts for builders that left draft status through any path (submit
  // from another surface, server-side transition). Builders absent from the
  // list are cleared by the explicit discard/close paths, not here — the
  // store outlives this screen and may hold other workspaces' drafts.
  useEffect(() => {
    for (const builder of builders) {
      if (builder.status !== 'draft') clear(builder.id)
    }
  }, [builders, clear])

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
    },
    []
  )

  return { change, clear }
}
