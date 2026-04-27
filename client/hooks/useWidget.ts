import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'

import { useMeiEvent } from './useMeiEvents'

type WidgetState =
  | { status: 'loading'; version: number }
  | { status: 'ready'; Component: ComponentType; version: number }
  | { status: 'error'; error: string; version: number }

const moduleCache = new Map<string, Promise<ComponentType>>()
let version = 0

function loadWidget(workspaceId: string, name: string, bust: boolean): Promise<ComponentType> {
  const key = `${workspaceId}/${name}`
  if (bust) {
    moduleCache.delete(key)
    version++
  }

  const existing = moduleCache.get(key)
  if (existing) return existing

  // Cache-busting query param so the browser fetches fresh
  const url = `/_mei/${workspaceId}/widgets/${name}.js?v=${version}`
  const promise = import(/* @vite-ignore */ url).then(mod => {
    if (!mod.default) throw new Error(`Widget "${name}" has no default export`)
    return mod.default as ComponentType
  })

  moduleCache.set(key, promise)
  return promise
}

export function useWidget(name: string): WidgetState {
  const workspaceId = useWorkspaceId()
  const [state, setState] = useState<WidgetState>({ status: 'loading', version: 0 })

  const load = useCallback(
    (bust = false) => {
      setState(prev => ({ status: 'loading', version: prev.version }))
      loadWidget(workspaceId, name, bust)
        .then(Component =>
          setState(prev => ({ status: 'ready', Component, version: prev.version + 1 }))
        )
        .catch(err =>
          setState(prev => ({ status: 'error', error: String(err), version: prev.version + 1 }))
        )
    },
    [workspaceId, name]
  )

  useEffect(() => {
    load()
  }, [load])

  // Reload when server says this widget was updated, OR when the agent
  // triggered a global data refresh (`moi refresh`). Both paths cache-bust
  // the import URL so the component remounts and useEffect-driven `rpc()`
  // calls re-execute against fresh data.
  useMeiEvent(event => {
    if (event.type === 'widget:updated' && event.name === name) {
      load(true)
    } else if (event.type === 'widgets:refresh') {
      load(true)
    }
  })

  return state
}
