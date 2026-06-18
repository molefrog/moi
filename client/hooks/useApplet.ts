import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'

import { type MeiEvent, useMeiEvent } from './useMeiEvents'

type AppletState =
  | { status: 'loading'; version: number }
  | { status: 'ready'; Component: ComponentType; version: number }
  | { status: 'error'; error: string; version: number }

// An applet kind (widget / view) differs only in its URL path segment and which
// MEI events tell it to reload. Everything else — dynamic import, caching,
// cache-busting — is shared. An applet is an agent-authored UI unit loaded as an
// ESM module and mounted into the workspace.
type AppletKind = {
  segment: 'widgets' | 'views'
  // True when this MEI event means the named applet should cache-bust + reload.
  shouldReload: (event: MeiEvent, name: string) => boolean
}

const WIDGET_KIND: AppletKind = {
  segment: 'widgets',
  shouldReload: (e, name) =>
    (e.type === 'widget:updated' && e.name === name) || e.type === 'widgets:refresh'
}

const VIEW_KIND: AppletKind = {
  segment: 'views',
  shouldReload: (e, name) => e.type === 'view:updated' && e.name === name
}

const moduleCache = new Map<string, Promise<ComponentType>>()
let version = 0

function loadApplet(
  kind: AppletKind,
  workspaceId: string,
  name: string,
  bust: boolean
): Promise<ComponentType> {
  // Namespace the cache key by kind so a widget and a view sharing a name don't
  // collide on the same entry.
  const key = `${kind.segment}/${workspaceId}/${name}`
  if (bust) {
    moduleCache.delete(key)
    version++
  }

  const existing = moduleCache.get(key)
  if (existing) return existing

  // Import the bundle dir's `index.js`; assets + chunks resolve module-relative
  // from there (via import.meta.url). Cache-busting query so the browser fetches
  // fresh — `?v` is dropped by relative asset resolution, so assets aren't
  // re-fetched needlessly (they're content-hashed anyway).
  const url = `/api/workspaces/${workspaceId}/${kind.segment}/${name}/index.js?v=${version}`
  const promise = import(/* @vite-ignore */ url).then(mod => {
    if (!mod.default) throw new Error(`"${name}" has no default export`)
    return mod.default as ComponentType
  })

  moduleCache.set(key, promise)
  return promise
}

function useApplet(kind: AppletKind, name: string): AppletState {
  const workspaceId = useWorkspaceId()
  const [state, setState] = useState<AppletState>({ status: 'loading', version: 0 })

  const load = useCallback(
    (bust = false) => {
      setState(prev => ({ status: 'loading', version: prev.version }))
      loadApplet(kind, workspaceId, name, bust)
        .then(Component =>
          setState(prev => ({ status: 'ready', Component, version: prev.version + 1 }))
        )
        .catch(err =>
          setState(prev => ({ status: 'error', error: String(err), version: prev.version + 1 }))
        )
    },
    [kind, workspaceId, name]
  )

  useEffect(() => {
    load()
  }, [load])

  // Reload when the server says this bundle was updated, OR (widgets only) when
  // the agent triggered a global data refresh (`moi refresh`). Both cache-bust
  // the import URL so the component remounts and its `rpc()` calls re-run.
  useMeiEvent(event => {
    if (kind.shouldReload(event, name)) load(true)
  })

  return state
}

export function useWidget(name: string): AppletState {
  return useApplet(WIDGET_KIND, name)
}

export function useView(name: string): AppletState {
  return useApplet(VIEW_KIND, name)
}
