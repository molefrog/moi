// The workspace applet runtime — the host side of the applet `moi` module.
//
// Every applet bundle inlines its own copy of the `moi` virtual module (see
// MOI_MODULE_SOURCE in server/applets/build-applet.ts), so each loaded module
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
import { snapshotTextAttachment } from '@/lib/moi-attachments'
import type { AttachmentInput, AttachmentOrigin } from '@/lib/types'
import { isWorkspaceAttachmentPath, MAX_UPLOAD_BYTES } from '@/lib/message-attachments'
import { useEffect } from 'react'

import { createNanoEvents } from 'nanoevents'

import { reportAppletError } from '@/client/features/applets/applet-log'
import { createRateLimiter, type RateLimiter } from '@/client/lib/rate-limit'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import type { AppletKind, WorkspaceTabId } from '@/lib/types'
import { isParamsRecord, isWorkspaceTabId } from '@/lib/workspace-tabs'

// Which applet a bridge belongs to, supplied by the host at attach time.
export type AppletIdentity = { kind: AppletKind; name: string }

export const appletSource = ({ kind, name }: AppletIdentity): string => `${kind}:${name}`

// A chat message fired from applet UI. `source` is stamped from the identity
// the bridge was attached with, so an applet can neither omit it nor claim to
// be another applet.
export type AppletChatMessage = {
  message: string
  source: string
  attachments: (AttachmentInput & AttachmentOrigin)[]
}

// Events a workspace runtime emits — already validated, typed for host code.
export type AppletEvents = {
  addChatAttachment: (attachment: AttachmentInput & AttachmentOrigin) => void
  // Client-local replace-navigation to a workspace tab. `params` reach the
  // target view as its `params` prop via navigation state — JSON-plain only
  // (history state is structured-cloned).
  focusTab: (tab: WorkspaceTabId, params?: Record<string, unknown>) => void
  // A message for the workspace's active chat, sent as if the user typed
  // `message`, with attachments prepared before the send.
  sendChatMessage: (message: AppletChatMessage) => void
}

// What a bundle's `moi` module calls. Args are `unknown` on purpose: they
// cross the trust boundary from agent-authored code, and the runtime narrows
// them before emitting.
export type AppletBridge = {
  addChatAttachment: (input: unknown) => void
  focusTab: (tab: unknown, params?: unknown) => void
  sendChatMessage: (input: unknown, context?: unknown) => void
}

// A message longer than this is a bug, not a chat message — it would land in
// a bubble verbatim.
const MAX_MESSAGE_CHARS = 1000

// Chat intents can be expensive: `sendChatMessage` starts an agent run, while
// `addChatAttachment` can upload or read a 32 MB file. Calling either during
// render fires once per render, and the bridge is per BUNDLE, so simultaneous
// mounts double every call. The cooldown collapses identical calls; the window
// cap bounds loops that vary their payload. Each intent gets its own budget,
// scoped to one workspace runtime.
const CHAT_LIMITS = { cooldownMs: 2_000, windowMs: 60_000, maxPerWindow: 10, maxKeys: 64 }

function createRuntime(workspaceId: string) {
  const emitter = createNanoEvents<AppletEvents>()
  // Keyed by `${source}\0${text}` — same applet, same message.
  const chatLimiter = createRateLimiter(CHAT_LIMITS)
  const attachmentLimiter = createRateLimiter(CHAT_LIMITS)

  // Drops are journaled, never silent: a message the agent never received has
  // to be discoverable in `moi debug logs`, or the applet author sees a dead
  // button with no explanation. `reportAppletError` has its own per-message
  // cooldown, so journaling a per-frame drop can't become a POST storm.
  const drop = (identity: AppletIdentity, reason: string) => {
    reportAppletError(workspaceId, {
      source: 'runtime',
      kind: identity.kind,
      name: identity.name,
      message: reason
    })
  }

  const admit = (
    limiter: RateLimiter,
    identity: AppletIdentity,
    key: string,
    cooldownReason: string,
    windowReason: string
  ): boolean => {
    const verdict = limiter.admit(key)
    if (verdict === 'ok') return true
    drop(identity, verdict === 'cooldown' ? cooldownReason : windowReason)
    return false
  }

  const admitChatMessage = (identity: AppletIdentity, source: string, text: string): boolean => {
    return admit(
      chatLimiter,
      identity,
      `${source}\0${text}`,
      `sendChatMessage() for "${text}" was dropped: the same message was already sent less than ${CHAT_LIMITS.cooldownMs / 1000}s ago. Call it from an event handler, not during render.`,
      `sendChatMessage() for "${text}" was dropped: more than ${CHAT_LIMITS.maxPerWindow} messages in a minute from this workspace. Each one starts an agent run, so send only on a real user action.`
    )
  }

  const admitChatAttachment = (
    identity: AppletIdentity,
    attachment: AttachmentInput & AttachmentOrigin
  ): boolean => {
    return admit(
      attachmentLimiter,
      identity,
      attachmentLimitKey(attachment),
      `addChatAttachment() was dropped: the same attachment was staged less than ${CHAT_LIMITS.cooldownMs / 1000}s ago. Call it from an event handler, not during render.`,
      `addChatAttachment() was dropped: more than ${CHAT_LIMITS.maxPerWindow} attachments were staged in a minute from this workspace. Stage attachments only on a real user action.`
    )
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
        addChatAttachment(input) {
          if (!alive) return
          try {
            const attachment = snapshotAttachmentInput(input, source)
            if (!admitChatAttachment(identity, attachment)) return
            emitter.emit('addChatAttachment', attachment)
          } catch (error) {
            drop(identity, `addChatAttachment() was dropped: ${errorMessage(error)}`)
          }
        },
        focusTab(tab, params) {
          if (!alive) return
          if (!isWorkspaceTabId(tab)) return
          emitter.emit('focusTab', tab, isParamsRecord(params) ? params : undefined)
        },
        sendChatMessage(input, legacyContext) {
          if (!alive) return
          try {
            // Runtime compatibility for older bundles. Both forms use the same
            // attachment validation and send path; only the object API is public.
            if (typeof input === 'string') {
              input = {
                message: input,
                attachments:
                  legacyContext === undefined
                    ? []
                    : [{ type: 'text', label: 'Context', text: JSON.stringify(legacyContext) }]
              }
            }
            if (!isParamsRecord(input) || typeof input.message !== 'string') {
              throw new Error('provide an object with a message string and optional attachments.')
            }
            if ('context' in input) {
              throw new Error('the context field is no longer supported. Use attachments instead.')
            }
            const message = input.message.trim()
            if (!message || message.length > MAX_MESSAGE_CHARS) {
              throw new Error(
                `message must be non-empty and at most ${MAX_MESSAGE_CHARS} characters. Put longer content in a text attachment.`
              )
            }
            if (input.attachments !== undefined && !Array.isArray(input.attachments)) {
              throw new Error('attachments must be an array.')
            }
            const attachments = Array.from(input.attachments ?? [], item =>
              snapshotAttachmentInput(item, source)
            )
            if (!admitChatMessage(identity, source, message)) return
            emitter.emit('sendChatMessage', { message, source, attachments })
          } catch (error) {
            drop(identity, `sendChatMessage() was dropped: ${errorMessage(error)}`)
          }
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

function attachmentLimitKey(attachment: AttachmentInput & AttachmentOrigin): string {
  if (attachment.type === 'text') {
    return `${attachment.source}\0text\0${attachment.label}\0${attachment.text}`
  }
  if (attachment.file) {
    const { name, type, size, lastModified } = attachment.file
    return `${attachment.source}\0file\0${name}\0${type}\0${size}\0${lastModified}`
  }
  return `${attachment.source}\0path\0${attachment.path}`
}

// Copy the caller's fields now so later applet mutations cannot change a send
// or staged attachment. File contents are immutable and can be retained as-is.
function snapshotAttachmentInput(
  input: unknown,
  source: string
): AttachmentInput & AttachmentOrigin {
  if (isParamsRecord(input)) {
    if (input.type === 'text') {
      const snapshot = snapshotTextAttachment(input)
      if (snapshot) return { type: 'text', ...snapshot, source }
    } else if (input.type === 'file') {
      if (
        input.file instanceof File &&
        input.path === undefined &&
        input.file.size <= MAX_UPLOAD_BYTES
      ) {
        return { type: 'file', file: input.file, source }
      }
      if (isWorkspaceAttachmentPath(input.path) && input.file === undefined) {
        return { type: 'file', path: input.path, source }
      }
    }
  }
  throw new Error(
    'provide labelled text (label max 120 characters, text max 5000), or exactly one File (max 32 MB) or workspace-relative path. Hidden paths are not allowed.'
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  const latest = useLatestRef(handler)

  useEffect(() => {
    // TS can't call a generic indexed function type with its own Parameters
    // tuple, so the forwarder is loosely typed inside and cast at the boundary.
    const forward = ((...args: unknown[]) =>
      (latest.current as (...forwarded: unknown[]) => void)(...args)) as AppletEvents[K]
    return appletRuntime(workspaceId).on(event, forward)
  }, [workspaceId, event, latest])
}

// The shape of the host wiring every bundle entry re-exports (see the entry
// plugin in server/applets/build-applet.ts).
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
