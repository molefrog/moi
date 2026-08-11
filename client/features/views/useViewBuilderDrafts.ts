import { useCallback, useEffect, useRef, useState } from 'react'

import { toast } from '@/client/components/ui/toast'
import type { ViewBuilder } from '@/lib/types'

type UseViewBuilderDraftsOptions = {
  builders: ViewBuilder[]
  onSave: (builderId: string, requirements: string) => Promise<unknown>
}

export function useViewBuilderDrafts({ builders, onSave }: UseViewBuilderDraftsOptions) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const buildersRef = useRef(builders)
  const onSaveRef = useRef(onSave)
  buildersRef.current = builders
  onSaveRef.current = onSave

  const clear = useCallback((builderId: string) => {
    const timer = timersRef.current.get(builderId)
    if (timer) clearTimeout(timer)
    timersRef.current.delete(builderId)
    setDrafts(current => {
      if (!(builderId in current)) return current
      const next = { ...current }
      delete next[builderId]
      return next
    })
  }, [])

  const change = useCallback((builderId: string, value: string) => {
    setDrafts(current => ({ ...current, [builderId]: value }))
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

  useEffect(() => {
    const draftIds = new Set(
      builders.filter(builder => builder.status === 'draft').map(builder => builder.id)
    )
    for (const builderId of Object.keys(drafts)) {
      if (!draftIds.has(builderId)) clear(builderId)
    }
  }, [builders, clear, drafts])

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
    },
    []
  )

  return {
    valueFor: (builder: ViewBuilder) => drafts[builder.id] ?? builder.input.requirements,
    change,
    clear
  }
}
