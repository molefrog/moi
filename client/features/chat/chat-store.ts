import type { ChatAttachment, ChatAttachmentPatch } from './composer/attachments/types'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { PreviewBlock, PreviewFrame, SessionActivity } from '@/lib/types'

// App-level ephemeral chat state — the bits that are *pushed* from the server
// over the WebSocket and can't be re-fetched as request/response data:
//   - per-session `activity` (spinner) state,
//   - per-session error banners.
//
// The durable message transcripts live in the React Query cache (see
// useSessionView), which is also app-level — so nothing here needs to mirror
// them. The selected session has its own persisted React Query context; this
// store only owns disposable live state.
//
// Per-session entries are keyed `${workspaceId}:${sessionId}`.

function key(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

export function isRunningActivity(activity: SessionActivity | undefined): boolean {
  return activity === 'running'
}

export function hasRunningActivity(activity: Record<string, SessionActivity>): boolean {
  return Object.values(activity).some(isRunningActivity)
}

export function isSessionRunning(
  activity: Record<string, SessionActivity>,
  workspaceId: string,
  sessionId: string
): boolean {
  return isRunningActivity(activity[key(workspaceId, sessionId)])
}

export function hasRunningWorkspaceActivity(
  activity: Record<string, SessionActivity>,
  workspaceId: string
): boolean {
  const prefix = `${workspaceId}:`
  return Object.entries(activity).some(
    ([activityKey, value]) => activityKey.startsWith(prefix) && isRunningActivity(value)
  )
}

export function hasRunningBackgroundSession(
  activity: Record<string, SessionActivity>,
  workspaceId: string,
  selectedSessionId: string | null
): boolean {
  if (!selectedSessionId) return false

  const prefix = `${workspaceId}:`
  const selectedKey = key(workspaceId, selectedSessionId)
  return Object.entries(activity).some(
    ([activityKey, value]) =>
      activityKey.startsWith(prefix) && activityKey !== selectedKey && isRunningActivity(value)
  )
}

// Attachments stay with the chat they were added to. A brand-new chat has no
// session id yet, so it gets a stable `'new'` sentinel until send mints one.
export function attachmentKey(workspaceId: string, sessionId: string | null): string {
  return key(workspaceId, sessionId ?? 'new')
}

// A live streaming preview held in the store, keyed by API message id. Ephemeral
// and disposable — see PreviewFrame. `updatedAt` drives the TTL sweep that reaps
// any preview a clear signal somehow never reached.
export type LivePreview = {
  workspaceId: string
  sessionId: string
  parentToolUseId: string | null
  blocks: PreviewBlock[]
  updatedAt: number
}

export type LiveStore = {
  // Per-session activity mirrored from server `status` frames. Missing key = idle.
  activity: Record<string, SessionActivity>
  errors: Record<string, string | null>
  // Live token-streaming previews, keyed by `messageId` (the API `msg_...` id)
  // so concurrent streams never collide. Reconciled against the durable
  // transcript: a preview is dropped the instant its finalized turn arrives.
  previews: Record<string, LivePreview>
  // Composer attachments are per chat, survive composer remounts, and clear on
  // send. Draft text is workspace-local persisted UI state (client/store/ui).
  attachments: Record<string, ChatAttachment[]>

  setActivity: (workspaceId: string, sessionId: string, value: SessionActivity) => void
  // Authoritative reconcile from a server `status_snapshot`: exactly the listed
  // sessions are active; everything else is cleared to idle (fixes a spinner
  // whose terminal status frame was lost while we were disconnected).
  reconcileActivity: (
    sessions: { workspaceId: string; sessionId: string; activity: SessionActivity }[]
  ) => void
  setError: (workspaceId: string, sessionId: string, message: string | null) => void
  addAttachments: (workspaceId: string, sessionId: string | null, items: ChatAttachment[]) => void
  updateAttachment: (workspaceId: string, localId: string, patch: ChatAttachmentPatch) => void
  removeAttachment: (workspaceId: string, localId: string) => void
  clearAttachments: (workspaceId: string, sessionId: string | null) => void
  // `null` assigns the new-chat draft its first session id.
  renameSession: (workspaceId: string, from: string | null, to: string) => void

  // Upsert a preview snapshot (last write wins — blocks are cumulative).
  setPreview: (frame: Omit<PreviewFrame, 'type'>) => void
  // Drop one preview by message id — used the instant its real turn lands.
  clearPreview: (messageId: string) => void
  // Drop every preview for a session — belt for run end / stop / error, where a
  // per-message clear might be missed (e.g. a turn without an apiMessageId).
  clearPreviewsForSession: (workspaceId: string, sessionId: string) => void
  // Drop everything — used on socket reconnect, where any in-flight preview is
  // definitionally superseded by the /events refetch.
  clearAllPreviews: () => void
  // Reap previews older than `maxAgeMs` (TTL backstop against a missed clear).
  sweepPreviews: (maxAgeMs: number, now: number) => void
}

// Stable IDs keep asynchronous attachment work attached to a renamed session.
export function findAttachment(
  attachments: LiveStore['attachments'],
  workspaceId: string,
  localId: string
) {
  for (const [key, items] of Object.entries(attachments)) {
    if (!key.startsWith(`${workspaceId}:`)) continue
    const attachment = items.find(item => item.localId === localId)
    if (attachment) return { key, attachment }
  }
}

export const liveStore = createStore<LiveStore>()(set => ({
  activity: {},
  errors: {},
  previews: {},
  attachments: {},

  setActivity: (workspaceId, sessionId, value) =>
    set(s => ({ activity: { ...s.activity, [key(workspaceId, sessionId)]: value } })),

  reconcileActivity: sessions =>
    set(() => ({
      activity: Object.fromEntries(sessions.map(r => [key(r.workspaceId, r.sessionId), r.activity]))
    })),

  setError: (workspaceId, sessionId, message) =>
    set(s => ({ errors: { ...s.errors, [key(workspaceId, sessionId)]: message } })),

  setPreview: frame =>
    set(s => ({
      previews: {
        ...s.previews,
        [frame.messageId]: {
          workspaceId: frame.workspaceId,
          sessionId: frame.sessionId,
          parentToolUseId: frame.parentToolUseId,
          blocks: frame.blocks,
          updatedAt: Date.now()
        }
      }
    })),

  clearPreview: messageId =>
    set(s => {
      if (!(messageId in s.previews)) return s
      const { [messageId]: _drop, ...rest } = s.previews
      return { previews: rest }
    }),

  clearPreviewsForSession: (workspaceId, sessionId) =>
    set(s => {
      const rest: Record<string, LivePreview> = {}
      let changed = false
      for (const [id, p] of Object.entries(s.previews)) {
        if (p.workspaceId === workspaceId && p.sessionId === sessionId) changed = true
        else rest[id] = p
      }
      return changed ? { previews: rest } : s
    }),

  clearAllPreviews: () => set(s => (Object.keys(s.previews).length ? { previews: {} } : s)),

  sweepPreviews: (maxAgeMs, now) =>
    set(s => {
      const rest: Record<string, LivePreview> = {}
      let changed = false
      for (const [id, p] of Object.entries(s.previews)) {
        if (now - p.updatedAt > maxAgeMs) changed = true
        else rest[id] = p
      }
      return changed ? { previews: rest } : s
    }),

  addAttachments: (workspaceId, sessionId, items) =>
    set(s => {
      const k = attachmentKey(workspaceId, sessionId)
      return { attachments: { ...s.attachments, [k]: [...(s.attachments[k] ?? []), ...items] } }
    }),

  updateAttachment: (workspaceId, localId, patch) =>
    set(s => {
      const found = findAttachment(s.attachments, workspaceId, localId)
      if (!found) return {}
      const { key: k, attachment: target } = found
      const list = s.attachments[k]
      if (
        target.kind !== 'text' &&
        target.previewUrl &&
        'previewUrl' in patch &&
        patch.previewUrl !== target.previewUrl
      ) {
        URL.revokeObjectURL(target.previewUrl)
      }
      return {
        attachments: {
          ...s.attachments,
          [k]: list.map(a => (a.localId === localId && a.kind !== 'text' ? { ...a, ...patch } : a))
        }
      }
    }),

  removeAttachment: (workspaceId, localId) =>
    set(s => {
      const found = findAttachment(s.attachments, workspaceId, localId)
      if (!found) return {}
      const { key: k, attachment: target } = found
      const list = s.attachments[k]
      if (target.kind !== 'text' && target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return { attachments: { ...s.attachments, [k]: list.filter(a => a.localId !== localId) } }
    }),

  clearAttachments: (workspaceId, sessionId) =>
    set(s => {
      const k = attachmentKey(workspaceId, sessionId)
      for (const a of s.attachments[k] ?? []) {
        if (a.kind !== 'text' && a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
      const next = { ...s.attachments }
      delete next[k]
      return { attachments: next }
    }),

  renameSession: (workspaceId, from, to) =>
    set(s => {
      const fromKey = attachmentKey(workspaceId, from)
      const toKey = key(workspaceId, to)
      const activity = { ...s.activity }
      const errors = { ...s.errors }
      if (fromKey in activity) {
        activity[toKey] = activity[fromKey]
        delete activity[fromKey]
      }
      if (fromKey in errors) {
        errors[toKey] = errors[fromKey]
        delete errors[fromKey]
      }
      // Retarget any in-flight previews from the temp id to the real one so a
      // preview that arrived before the rename keeps routing to the session.
      let previews = s.previews
      let previewsChanged = false
      for (const [id, p] of Object.entries(s.previews)) {
        if (p.workspaceId === workspaceId && p.sessionId === from) {
          if (!previewsChanged) {
            previews = { ...s.previews }
            previewsChanged = true
          }
          previews[id] = { ...p, sessionId: to }
        }
      }
      // Upload completions use stable attachment IDs, so every draft item can
      // follow the chat through both temporary and provider session IDs.
      let attachments = s.attachments
      if (fromKey !== toKey && attachments[fromKey]) {
        attachments = {
          ...attachments,
          [toKey]: [...(attachments[toKey] ?? []), ...attachments[fromKey]]
        }
        delete attachments[fromKey]
      }
      return { activity, errors, previews, attachments }
    })
}))

// Select the live previews for a session, split into the root (top-level
// assistant) stream and per-subagent streams. The container object is fresh
// per call, but `root` and the `byParent` values are the STORED preview
// objects — so a zustand selector may return one of those directly (identity
// only changes when that stream gets a delta), while returning the container
// itself from a selector would re-render on every store write. `null`
// sessionId yields empties.
export function selectPreviews(
  previews: Record<string, LivePreview>,
  workspaceId: string,
  sessionId: string | null
): { root: LivePreview | null; byParent: Record<string, LivePreview> } {
  if (!sessionId) return { root: null, byParent: {} }
  let root: LivePreview | null = null
  const byParent: Record<string, LivePreview> = {}
  for (const p of Object.values(previews)) {
    if (p.workspaceId !== workspaceId || p.sessionId !== sessionId) continue
    if (p.parentToolUseId === null) {
      // At most one root stream is active at a time; keep the freshest.
      if (!root || p.updatedAt > root.updatedAt) root = p
    } else {
      const prev = byParent[p.parentToolUseId]
      if (!prev || p.updatedAt > prev.updatedAt) byParent[p.parentToolUseId] = p
    }
  }
  return { root, byParent }
}

// Reactive selector hook bound to the singleton store.
export function useLive<T>(selector: (state: LiveStore) => T): T {
  return useStore(liveStore, selector)
}
