// Client half of the intent system (docs/intents.md): resolve a dispatch to
// the first view declaring its name, switch the active tab, and hand the
// payload to the mounted view component as props. Delivered state is
// ephemeral in-memory — never persisted into the workspace layout — so a
// reload clears it. The `window.moi` runtime installed here is what applet
// bundles reach through the `moi` virtual module's `intent`/`sendAction`.
import { useEffect, useRef } from 'react'

import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { matchBundleUrl, reportAppletError } from '@/client/features/applets/applet-log'
import { resolveIntentView } from '@/lib/intents'
import type { IntentDispatch } from '@/lib/intents'
import type { AppletKind, MoiAppletRuntime, ViewInfo, WorkspaceTabId } from '@/lib/types'

declare global {
  interface Window {
    moi?: MoiAppletRuntime
  }
}

// The last delivered intent per view, keyed `${workspaceId}:${viewId}`. Kept
// (not one-shot) so a rebuild remount re-receives the same props; replaced by
// the next dispatch to the same view.
export type DeliveredIntent = { intent: string; params: Record<string, unknown> }

type IntentStore = {
  delivered: Record<string, DeliveredIntent>
  deliver: (workspaceId: string, viewId: string, delivery: DeliveredIntent) => void
}

export const intentStore = createStore<IntentStore>()(set => ({
  delivered: {},
  deliver: (workspaceId, viewId, delivery) =>
    set(s => ({ delivered: { ...s.delivered, [`${workspaceId}:${viewId}`]: delivery } }))
}))

// Reactive read for the mounted view (see ViewApp in WorkspaceScreen).
export function useDeliveredIntent(
  workspaceId: string,
  viewId: string
): DeliveredIntent | undefined {
  return useStore(intentStore, s => s.delivered[`${workspaceId}:${viewId}`])
}

// `widget:products` → { kind: 'widget', name: 'products' } for journal
// attribution; null for non-applet sources (`cli`). Exported for tests.
export function appletFromSource(source: string): { kind: AppletKind; name: string } | null {
  const m = source.match(/^(widget|view):([a-zA-Z0-9_-]+)$/)
  if (!m) return null
  return { kind: m[1] === 'widget' ? 'widget' : 'view', name: m[2] }
}

export type IntentRouteCtx = {
  workspaceId: string
  views: ViewInfo[]
  openTab: (tab: WorkspaceTabId) => void
}

// Route one dispatch (from the CLI event or an applet's `moi.intent` call):
// first declaring view wins. An unresolved dispatch is recorded in the applet
// error journal so the authoring agent sees it in `moi debug logs` instead of
// it vanishing. Returns whether the dispatch resolved.
export function routeIntentDispatch(ctx: IntentRouteCtx, dispatch: IntentDispatch): boolean {
  const view = resolveIntentView(ctx.views, dispatch.name)
  if (!view) {
    reportAppletError(ctx.workspaceId, {
      source: 'intent',
      ...(appletFromSource(dispatch.source) ?? {}),
      message: `no view declares intent "${dispatch.name}" (dispatched by ${dispatch.source})`
    })
    return false
  }
  intentStore
    .getState()
    .deliver(ctx.workspaceId, view.id, { intent: dispatch.name, params: dispatch.params ?? {} })
  ctx.openTab(`view:${view.id}`)
  return true
}

// The originating applet of a `window.moi` call, recovered from the stack:
// applet bundles load from `/api/workspaces/<id>/(widgets|views)/<name>/`, so
// the topmost matching frame names the caller (same trick the error journal
// uses for window errors). Non-applet callers fall back to 'applet'.
function callerApplet(): string {
  const ref = matchBundleUrl(new Error().stack)
  return ref ? `${ref.kind}:${ref.name}` : 'applet'
}

export type MoiRuntimeHost = {
  dispatch: (dispatch: IntentDispatch) => void
  sendAction: (label: string, context: Record<string, unknown> | undefined, source: string) => void
}

// Install the applet-facing runtime at `window.moi` for the mounted
// workspace. The host callbacks are read through a ref so the installed
// object survives re-renders while always seeing fresh state.
export function useMoiAppletRuntime(host: MoiRuntimeHost): void {
  const hostRef = useRef(host)
  hostRef.current = host
  useEffect(() => {
    const runtime: MoiAppletRuntime = {
      intent: (name, params) => {
        hostRef.current.dispatch({
          name: String(name),
          ...(params && typeof params === 'object' ? { params } : {}),
          source: callerApplet()
        })
      },
      sendAction: (label, context) => {
        hostRef.current.sendAction(
          String(label),
          context && typeof context === 'object' ? context : undefined,
          callerApplet()
        )
      }
    }
    window.moi = runtime
    return () => {
      if (window.moi === runtime) delete window.moi
    }
  }, [])
}
