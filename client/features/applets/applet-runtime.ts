// The workspace applet runtime — the host side of the applet `moi` module.
//
// Every applet bundle inlines its own copy of the `moi` virtual module (see
// MOI_MODULE_SOURCE in server/bundler/build-applet.ts), so each loaded module
// instance holds a private `bridge` slot. Right after the dynamic import, the
// host connects that instance to the workspace's runtime by attaching a thin
// bridge (`attachAppletBridge`); invalidation disposes it (`disposeAppletBridge`),
// leaving a stale module instance — old timers, old listeners — inert instead
// of steering the app. One runtime per workspace id; the workspace screen
// publishes the actual behavior via `useAppletHandlers`.
import { useEffect, useRef, useState } from 'react'

import type { WorkspaceTabId } from '@/lib/types'
import { isParamsRecord, isWorkspaceTabId } from '@/lib/workspace-tabs'

// What the host implements — validated, typed calls.
export type AppletHandlers = {
  // Client-local replace-navigation to a workspace tab. `params` reach the
  // target view as its `params` prop via navigation state — JSON-plain only
  // (history state is structured-cloned).
  focusTab: (tab: WorkspaceTabId, params?: Record<string, unknown>) => void
}

// What a bundle's `moi` module calls. Args are `unknown` on purpose: they
// cross the trust boundary from agent-authored code, and the runtime narrows
// them before touching a handler.
export type AppletBridge = {
  focusTab: (tab: unknown, params?: unknown) => void
}

type AppletRuntime = {
  setHandlers: (next: AppletHandlers) => void
  // Ownership-checked so an unmounting screen never clears a successor's
  // handlers (StrictMode replay, workspace remounts).
  clearHandlers: (current: AppletHandlers) => void
  connect: () => { bridge: AppletBridge; dispose: () => void }
}

function createRuntime(): AppletRuntime {
  let handlers: AppletHandlers | null = null

  return {
    setHandlers(next) {
      handlers = next
    },
    clearHandlers(current) {
      if (handlers === current) handlers = null
    },
    // One connection per loaded module instance. The bridge validates every
    // call — a malformed tab id or params shape from applet code drops the
    // call instead of reaching a handler — and `dispose` flips the connection
    // dead so a disposed module can never act again.
    connect() {
      let alive = true
      const bridge: AppletBridge = {
        focusTab(tab, params) {
          if (!alive || !handlers) return
          if (!isWorkspaceTabId(tab)) return
          handlers.focusTab(tab, isParamsRecord(params) ? params : undefined)
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

const runtimes = new Map<string, AppletRuntime>()

export function appletRuntime(workspaceId: string): AppletRuntime {
  let runtime = runtimes.get(workspaceId)
  if (!runtime) {
    runtime = createRuntime()
    runtimes.set(workspaceId, runtime)
  }
  return runtime
}

// Publish the workspace screen's handlers to its runtime. Published DURING
// render (idempotent — the forwarder is stable per hook instance and reads the
// latest handlers through a ref), not in an effect: an applet can call its
// bridge the moment it mounts, and child effects run before parent effects.
// The effect exists only to re-publish after StrictMode's cleanup replay and
// to clear on unmount, so a cached applet from a backgrounded workspace can't
// navigate the app through dead handlers.
export function useAppletHandlers(workspaceId: string, handlers: AppletHandlers): void {
  const latest = useRef(handlers)
  latest.current = handlers
  const [forwarder] = useState<AppletHandlers>(() => ({
    focusTab: (tab, params) => latest.current.focusTab(tab, params)
  }))

  appletRuntime(workspaceId).setHandlers(forwarder)

  useEffect(() => {
    const runtime = appletRuntime(workspaceId)
    runtime.setHandlers(forwarder)
    return () => runtime.clearHandlers(forwarder)
  }, [workspaceId, forwarder])
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
