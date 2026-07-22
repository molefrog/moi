import type { ComponentType } from 'react'
import { useCallback, useEffect, useState } from 'react'

import {
  type AppletSegment,
  appletKey,
  appletUrl,
  getCachedApplet,
  invalidateApplet,
  setCachedApplet
} from '@/client/features/applets/applet-cache'
import { reportAppletError } from '@/client/features/applets/applet-log'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { type WorkspaceEvent, useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import type { AppletKind, ViewIntentProps } from '@/lib/types'

// Applet components take the (all-optional) intent-delivery props — views
// receive them when a dispatch routes to them (docs/intents.md); widgets are
// simply mounted without any.
type AppletState =
  | { status: 'loading'; version: number }
  | { status: 'ready'; Component: ComponentType<ViewIntentProps>; version: number }
  | { status: 'error'; error: string; version: number }

// An applet kind (widget / view) differs only in its URL path segment and which
// MEI events tell it to reload. Everything else — dynamic import, caching,
// cache-busting — is shared. An applet is an agent-authored UI unit loaded as an
// ESM module and mounted into the workspace.
type AppletKindSpec = {
  kind: AppletKind
  segment: AppletSegment
  // True when this MEI event means the named applet should cache-bust + reload.
  shouldReload: (event: WorkspaceEvent, name: string) => boolean
}

const WIDGET_KIND: AppletKindSpec = {
  kind: 'widget',
  segment: 'widgets',
  shouldReload: (e, name) =>
    (e.type === 'widget:updated' && e.name === name) || e.type === 'widgets:refresh'
}

const VIEW_KIND: AppletKindSpec = {
  kind: 'view',
  segment: 'views',
  shouldReload: (e, name) => e.type === 'view:updated' && e.name === name
}

function loadApplet(
  segment: AppletSegment,
  workspaceId: string,
  name: string
): Promise<ComponentType<ViewIntentProps>> {
  const key = appletKey(segment, workspaceId, name)
  const existing = getCachedApplet(key) as Promise<ComponentType<ViewIntentProps>> | undefined
  if (existing) return existing

  // Import the bundle dir's `index.js` at its current `?v`; the version is bumped
  // (and this entry dropped) by `invalidateApplet` on every rebuild — including
  // while this applet is unmounted — so a backgrounded tab never serves stale.
  const promise = import(/* @vite-ignore */ appletUrl(segment, workspaceId, name)).then(mod => {
    if (!mod.default) throw new Error(`"${name}" has no default export`)
    return mod.default as ComponentType<ViewIntentProps>
  })

  setCachedApplet(key, promise)
  return promise
}

function useApplet(kind: AppletKindSpec, name: string): AppletState {
  const workspaceId = useWorkspaceId()
  const [state, setState] = useState<AppletState>({ status: 'loading', version: 0 })

  const load = useCallback(() => {
    setState(prev => ({ status: 'loading', version: prev.version }))
    loadApplet(kind.segment, workspaceId, name)
      .then(Component =>
        setState(prev => ({ status: 'ready', Component, version: prev.version + 1 }))
      )
      .catch(err => {
        // Journal the load failure so `moi debug logs` can surface it to the
        // agent — otherwise only this tab ever sees it (docs/self-correction.md).
        reportAppletError(workspaceId, {
          source: 'load',
          kind: kind.kind,
          name,
          message: String(err),
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {})
        })
        setState(prev => ({ status: 'error', error: String(err), version: prev.version + 1 }))
      })
  }, [kind, workspaceId, name])

  useEffect(() => {
    load()
  }, [load])

  // Reload the MOUNTED applet the moment the server says its bundle changed (or,
  // widgets only, `moi refresh`). Invalidate first so we don't re-read a stale
  // cache entry — `useAppletCacheInvalidation` may already have done so for the
  // unmounted case, but doing it here keeps this self-sufficient and
  // order-independent. The bumped version remounts the component and re-runs its
  // `rpc()` calls.
  useWorkspaceEvent(event => {
    if (kind.shouldReload(event, name)) {
      invalidateApplet(kind.segment, workspaceId, name)
      load()
    }
  })

  return state
}

export function useWidget(name: string): AppletState {
  return useApplet(WIDGET_KIND, name)
}

export function useView(name: string): AppletState {
  return useApplet(VIEW_KIND, name)
}

// Mount once per workspace (in the workspace route). Invalidates the shared
// applet module cache on every `*:updated` event, regardless of what's currently
// mounted — so an applet edited while its tab is backgrounded is fetched fresh on
// the next mount instead of served stale. The per-applet listener above only
// fires while that applet is on screen; this covers the (common) rest.
export function useAppletCacheInvalidation(): void {
  const workspaceId = useWorkspaceId()
  useWorkspaceEvent(event => {
    if (event.type === 'view:updated') invalidateApplet('views', workspaceId, event.name)
    else if (event.type === 'widget:updated') invalidateApplet('widgets', workspaceId, event.name)
  })
}
