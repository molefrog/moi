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

import { reportAppletError } from '@/client/features/applets/applet-log'
import { MAX_APPLET_CONTEXT_CHARS } from '@/lib/moi-context'
import type { AppletKind, WorkspaceTabId } from '@/lib/types'
import { isParamsRecord, isWorkspaceTabId } from '@/lib/workspace-tabs'

// Which applet a bridge belongs to, supplied by the host at attach time.
export type AppletIdentity = { kind: AppletKind; name: string }

export const appletSource = ({ kind, name }: AppletIdentity): string => `${kind}:${name}`

// A chat message fired from applet UI. `source` is stamped from the identity
// the bridge was attached with, so an applet can neither omit it nor claim to
// be another applet.
export type AppletChatMessage = {
  label: string
  source: string
  context?: Record<string, unknown>
}

// Events a workspace runtime emits — already validated, typed for host code.
export type AppletEvents = {
  // Client-local replace-navigation to a workspace tab. `params` reach the
  // target view as its `params` prop via navigation state — JSON-plain only
  // (history state is structured-cloned).
  focusTab: (tab: WorkspaceTabId, params?: Record<string, unknown>) => void
  // A message for the workspace's active chat, sent as if the user typed
  // `label`. `context` rides the `<moi-context>` envelope, not the bubble.
  sendChatMessage: (message: AppletChatMessage) => void
}

// What a bundle's `moi` module calls. Args are `unknown` on purpose: they
// cross the trust boundary from agent-authored code, and the runtime narrows
// them before emitting.
export type AppletBridge = {
  focusTab: (tab: unknown, params?: unknown) => void
  sendChatMessage: (label: unknown, context?: unknown) => void
}

// A label longer than this is a bug, not a message — it would land in a chat
// bubble verbatim.
const MAX_LABEL_CHARS = 1000

// `sendChatMessage` starts an agent run, which makes a stuck applet expensive
// in a way `focusTab` is not: a widget calling it during render fires once per
// render, and the bridge is per BUNDLE, so two simultaneous mounts of one
// applet double every call. Two bounds per workspace: identical messages
// collapse within the cooldown (which also absorbs the double-mount), and the
// window cap bounds everything else, including a loop that varies its label.
const CHAT_COOLDOWN_MS = 2_000
const CHAT_RATE_WINDOW_MS = 60_000
const CHAT_MAX_PER_WINDOW = 10

function createRuntime(workspaceId: string) {
  const emitter = createNanoEvents<AppletEvents>()
  // `${source}\0${label}` → last send. Bounded by the applet count in practice;
  // a label that varies every call is caught by the window cap instead.
  const lastSentAt = new Map<string, number>()
  let windowStart = 0
  let windowCount = 0

  // Drops are journaled, never silent: a message the agent never received has
  // to be discoverable in `moi debug logs`, or the applet author sees a dead
  // button with no explanation. `reportAppletError` has its own per-message
  // cooldown, so journaling a per-frame drop can't become a POST storm.
  const drop = (identity: AppletIdentity, message: string) => {
    reportAppletError(workspaceId, {
      source: 'runtime',
      kind: identity.kind,
      name: identity.name,
      message
    })
  }

  // True when this message may go out; records the send as a side effect.
  const admitChatMessage = (identity: AppletIdentity, source: string, label: string): boolean => {
    const now = Date.now()
    const key = `${source}\0${label}`
    const last = lastSentAt.get(key)
    if (last !== undefined && now - last < CHAT_COOLDOWN_MS) {
      drop(
        identity,
        `sendChatMessage("${label}") was dropped: the same message was already sent less than ${CHAT_COOLDOWN_MS / 1000}s ago. Call it from an event handler, not during render.`
      )
      return false
    }
    if (now - windowStart >= CHAT_RATE_WINDOW_MS) {
      windowStart = now
      windowCount = 0
    }
    if (windowCount >= CHAT_MAX_PER_WINDOW) {
      drop(
        identity,
        `sendChatMessage("${label}") was dropped: more than ${CHAT_MAX_PER_WINDOW} messages in a minute from this workspace. Each one starts an agent run, so send only on a real user action.`
      )
      return false
    }
    windowCount++
    lastSentAt.set(key, now)
    if (lastSentAt.size > 64) {
      for (const stale of [...lastSentAt.keys()].slice(0, 32)) lastSentAt.delete(stale)
    }
    return true
  }

  return {
    on<K extends keyof AppletEvents>(event: K, cb: AppletEvents[K]) {
      return emitter.on(event, cb)
    },
    // One connection per loaded module instance. The bridge validates every
    // call — a malformed tab id or params shape from applet code drops the
    // call instead of being emitted — and `dispose` flips the connection dead
    // so a disposed module can never act again. Emitting with no subscribers
    // (workspace screen unmounted) is a no-op by nanoevents semantics.
    connect(identity: AppletIdentity) {
      let alive = true
      const source = appletSource(identity)
      const bridge: AppletBridge = {
        focusTab(tab, params) {
          if (!alive) return
          if (!isWorkspaceTabId(tab)) return
          emitter.emit('focusTab', tab, isParamsRecord(params) ? params : undefined)
        },
        sendChatMessage(label, context) {
          if (!alive) return
          if (typeof label !== 'string') return
          const text = label.trim()
          if (!text) return
          if (text.length > MAX_LABEL_CHARS) {
            drop(
              identity,
              `sendChatMessage() was dropped: the label is ${text.length} characters (max ${MAX_LABEL_CHARS}). Put long content in the context argument, not the label.`
            )
            return
          }
          if (!admitChatMessage(identity, source, text)) return
          emitter.emit('sendChatMessage', {
            label: text,
            source,
            ...(context !== undefined
              ? { context: narrowChatContext(identity, context, drop) }
              : {})
          })
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

// The label carries the user's intent, so a bad `context` drops the payload
// and keeps the message rather than losing the whole call. Returns undefined
// for anything that can't ride the envelope: a non-record, something that
// won't serialize (cycles, functions, BigInt), or an oversized blob.
function narrowChatContext(
  identity: AppletIdentity,
  context: unknown,
  drop: (identity: AppletIdentity, message: string) => void
): Record<string, unknown> | undefined {
  if (!isParamsRecord(context)) {
    drop(identity, 'sendChatMessage() ignored its context argument: it must be a plain object.')
    return undefined
  }
  let json: string
  try {
    json = JSON.stringify(context)
  } catch {
    drop(
      identity,
      'sendChatMessage() ignored its context argument: it is not JSON-serializable (cycles, functions, or BigInt).'
    )
    return undefined
  }
  if (json.length > MAX_APPLET_CONTEXT_CHARS) {
    drop(
      identity,
      `sendChatMessage() ignored its context argument: ${json.length} characters serialized (max ${MAX_APPLET_CONTEXT_CHARS}). Send an id the agent can look up instead of the whole payload.`
    )
    return undefined
  }
  return context
}

type AppletRuntime = ReturnType<typeof createRuntime>

const runtimes = new Map<string, AppletRuntime>()

export function appletRuntime(workspaceId: string): AppletRuntime {
  let runtime = runtimes.get(workspaceId)
  if (!runtime) {
    runtime = createRuntime(workspaceId)
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
// namespace is in hand, before React ever renders the component. The identity
// is the host's, not the applet's: it is what `sendChatMessage` self-attributes
// with, so it must come from the load path that knows which file this is.
// Bundles built before the bridge exports existed no-op here until
// `moi bundle` rebuilds them.
export function attachAppletBridge(
  mod: unknown,
  workspaceId: string,
  key: string,
  identity: AppletIdentity
): void {
  const attach = (mod as BridgeModule).__attachBridge
  if (typeof attach !== 'function') return
  // A key is re-attached only after invalidation disposed it, but never leave
  // a live orphan connection behind if that ordering ever changes.
  connections.get(key)?.()
  const { bridge, dispose } = appletRuntime(workspaceId).connect(identity)
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
