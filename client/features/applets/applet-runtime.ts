// The workspace applet runtime — the host side of the applet `moi` module.
//
// Every applet bundle inlines its own copy of the `moi` virtual module (see
// MOI_MODULE_SOURCE in server/bundler/build-applet.ts), so each loaded module
// instance holds a private `bridge` slot. Right after the dynamic import, the
// host connects that instance to the workspace's runtime by attaching a thin
// bridge (`attachAppletBridge`); invalidation disposes it (`disposeAppletBridge`),
// leaving a stale module instance — old timers, old listeners — inert instead
// of steering the app. One runtime per workspace id.
//
// Applet calls surface as runtime EVENTS: the bridge validates the untrusted
// args, then emits, and each host feature subscribes to its own concern with
// `useAppletEvent` (navigation owns `focusTab`; chat will own `sendChatMessage`)
// — no central handlers object assembled by the screen. Applet → host only;
// if a host → applet direction is ever added (`moi.on(...)`), `dispose` must
// also unbind those listeners or a disposed module leaks.
import { useEffect, useRef } from 'react'

import { createNanoEvents } from 'nanoevents'

import type { WorkspaceTabId } from '@/lib/types'
import { isParamsRecord, isWorkspaceTabId } from '@/lib/workspace-tabs'

// Events a workspace runtime emits — already validated, typed for host code.
export type AppletEvents = {
  // Client-local replace-navigation to a workspace tab. `params` reach the
  // target view as its `params` prop via navigation state — JSON-plain only
  // (history state is structured-cloned).
  focusTab: (tab: WorkspaceTabId, params?: Record<string, unknown>) => void
}

// What a bundle's `moi` module calls. Args are `unknown` on purpose: they
// cross the trust boundary from agent-authored code, and the runtime narrows
// them before emitting.
export type AppletBridge = {
  focusTab: (tab: unknown, params?: unknown) => void
}

function createRuntime() {
  const emitter = createNanoEvents<AppletEvents>()

  return {
    on<K extends keyof AppletEvents>(event: K, cb: AppletEvents[K]) {
      return emitter.on(event, cb)
    },
    // One connection per loaded module instance. The bridge validates every
    // call — a malformed tab id or params shape from applet code drops the
    // call instead of being emitted — and `dispose` flips the connection dead
    // so a disposed module can never act again. Emitting with no subscribers
    // (workspace screen unmounted) is a no-op by nanoevents semantics.
    connect() {
      let alive = true
      const bridge: AppletBridge = {
        focusTab(tab, params) {
          if (!alive) return
          if (!isWorkspaceTabId(tab)) return
          emitter.emit('focusTab', tab, isParamsRecord(params) ? params : undefined)
        }
      }
      return {
        bridge,
        dispose: () => {
          alive = false
        }
      }
    }
  }
}

type AppletRuntime = ReturnType<typeof createRuntime>

const runtimes = new Map<string, AppletRuntime>()

export function appletRuntime(workspaceId: string): AppletRuntime {
  let runtime = runtimes.get(workspaceId)
  if (!runtime) {
    runtime = createRuntime()
    runtimes.set(workspaceId, runtime)
  }
  return runtime
}

// Subscribe a host feature to one applet event for the lifetime of the
// component. The subscription is stable across re-renders — the listener reads
// the latest `handler` through a ref, so an inline arrow doesn't churn the
// emitter — and StrictMode's effect replay just unbinds and re-binds.
export function useAppletEvent<K extends keyof AppletEvents>(
  workspaceId: string,
  event: K,
  handler: AppletEvents[K]
): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    // TS can't call a generic indexed function type with its own Parameters
    // tuple, so the forwarder is loosely typed inside and cast at the boundary.
    const forward = ((...args: unknown[]) =>
      (latest.current as (...forwarded: unknown[]) => void)(...args)) as AppletEvents[K]
    return appletRuntime(workspaceId).on(event, forward)
  }, [workspaceId, event])
}

// The shape of the host wiring every bundle entry re-exports (see the entry
// plugin in server/bundler/build-applet.ts).
type BridgeModule = {
  __attachBridge?: (bridge: AppletBridge) => void
}

// Live connections keyed by applet cache key (`${segment}/${workspaceId}/${name}`)
// — the same identity `applet-cache.ts` uses for module lifetime, so disposal
// rides invalidation.
const connections = new Map<string, () => void>()

// Wire a freshly imported applet module to its workspace runtime. Called from
// the dynamic-import `.then` in useApplet — the only moment the module
// namespace is in hand, before React ever renders the component. Bundles built
// before the bridge exports existed no-op here until `moi bundle` rebuilds them.
export function attachAppletBridge(mod: unknown, workspaceId: string, key: string): void {
  const attach = (mod as BridgeModule).__attachBridge
  if (typeof attach !== 'function') return
  // A key is re-attached only after invalidation disposed it, but never leave
  // a live orphan connection behind if that ordering ever changes.
  connections.get(key)?.()
  const { bridge, dispose } = appletRuntime(workspaceId).connect()
  connections.set(key, dispose)
  attach(bridge)
}

// Neuter the bridge of the module instance loaded under `key`. The browser
// keeps the old module alive forever (ES modules are never unloaded), but its
// calls now stop at the dead connection.
export function disposeAppletBridge(key: string): void {
  const dispose = connections.get(key)
  if (!dispose) return
  connections.delete(key)
  dispose()
}
