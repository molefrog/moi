import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { UploadInfo } from '@/lib/types'

// One composer attachment, tracked per thread until the message is sent. It is
// uploaded as soon as it's added (drop/paste/pick); `status` reflects that
// in-flight upload, and `upload` holds the server handle once ready. `previewUrl`
// is a local object URL for image thumbnails (revoked on remove/clear).
export type ChatAttachment = {
  localId: string
  name: string
  mediaType: string
  previewUrl?: string
  status: 'uploading' | 'ready' | 'error'
  upload?: UploadInfo
  error?: string
}

// App-level ephemeral chat state — the bits that are *pushed* from the server
// over the WebSocket and can't be re-fetched as request/response data:
//   - which thread is active per workspace (a UI selection),
//   - per-session `processing` (spinner) flags,
//   - per-session error banners.
//
// The durable message transcripts live in the React Query cache (see
// useSessionView), which is also app-level — so nothing here needs to mirror
// them. This is a single module-singleton store (not React-context scoped), so
// it survives route navigation: leaving and re-entering a workspace keeps the
// active thread and any in-flight spinner intact.
//
// Per-session entries are keyed `${workspaceId}:${sessionId}`.

function key(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`
}

// Draft text is keyed per thread. A brand-new chat has no session id yet, so it
// gets a stable `'new'` sentinel; once `send` mints the real id the input reads
// the (empty) draft under the new key. Exported so `ChatInput` builds the same
// key it reads as the store writes.
export function draftKey(workspaceId: string, sessionId: string | null): string {
  return key(workspaceId, sessionId ?? 'new')
}

export type LiveStore = {
  activeByWorkspace: Record<string, string | null>
  processing: Record<string, boolean>
  errors: Record<string, string | null>
  // Unsent composer text, keyed per thread (`${workspaceId}:${sessionId}`, with
  // a `'new'` sentinel for a not-yet-created thread). Lives here — not in the
  // chat component — so a keystroke re-renders only the composer (which alone
  // subscribes), not the whole workspace, and the draft survives the chat
  // panel's remounts on mode switch.
  drafts: Record<string, string>
  // Composer attachments, keyed per thread exactly like `drafts` (so they follow
  // the active thread and survive composer remounts). Cleared on send.
  attachments: Record<string, ChatAttachment[]>

  setActive: (workspaceId: string, sessionId: string | null) => void
  setProcessing: (workspaceId: string, sessionId: string, value: boolean) => void
  // Authoritative reconcile from a server `status_snapshot`: exactly the listed
  // sessions are processing; everything else is cleared (fixes a spinner whose
  // terminal status was emitted while we were disconnected).
  reconcileProcessing: (running: { workspaceId: string; sessionId: string }[]) => void
  setError: (workspaceId: string, sessionId: string, message: string | null) => void
  setDraft: (workspaceId: string, sessionId: string | null, value: string) => void
  addAttachments: (workspaceId: string, sessionId: string | null, items: ChatAttachment[]) => void
  updateAttachment: (
    workspaceId: string,
    sessionId: string | null,
    localId: string,
    patch: Partial<ChatAttachment>
  ) => void
  removeAttachment: (workspaceId: string, sessionId: string | null, localId: string) => void
  clearAttachments: (workspaceId: string, sessionId: string | null) => void
  renameSession: (workspaceId: string, from: string, to: string) => void
}

export const liveStore = createStore<LiveStore>()(set => ({
  activeByWorkspace: {},
  processing: {},
  errors: {},
  drafts: {},
  attachments: {},

  setActive: (workspaceId, sessionId) =>
    set(s => ({ activeByWorkspace: { ...s.activeByWorkspace, [workspaceId]: sessionId } })),

  setProcessing: (workspaceId, sessionId, value) =>
    set(s => ({ processing: { ...s.processing, [key(workspaceId, sessionId)]: value } })),

  reconcileProcessing: running =>
    set(() => ({
      processing: Object.fromEntries(running.map(r => [key(r.workspaceId, r.sessionId), true]))
    })),

  setError: (workspaceId, sessionId, message) =>
    set(s => ({ errors: { ...s.errors, [key(workspaceId, sessionId)]: message } })),

  setDraft: (workspaceId, sessionId, value) =>
    set(s => ({ drafts: { ...s.drafts, [draftKey(workspaceId, sessionId)]: value } })),

  addAttachments: (workspaceId, sessionId, items) =>
    set(s => {
      const k = draftKey(workspaceId, sessionId)
      return { attachments: { ...s.attachments, [k]: [...(s.attachments[k] ?? []), ...items] } }
    }),

  updateAttachment: (workspaceId, sessionId, localId, patch) =>
    set(s => {
      const k = draftKey(workspaceId, sessionId)
      const list = s.attachments[k]
      if (!list) return {}
      return {
        attachments: {
          ...s.attachments,
          [k]: list.map(a => (a.localId === localId ? { ...a, ...patch } : a))
        }
      }
    }),

  removeAttachment: (workspaceId, sessionId, localId) =>
    set(s => {
      const k = draftKey(workspaceId, sessionId)
      const list = s.attachments[k]
      if (!list) return {}
      const target = list.find(a => a.localId === localId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return { attachments: { ...s.attachments, [k]: list.filter(a => a.localId !== localId) } }
    }),

  clearAttachments: (workspaceId, sessionId) =>
    set(s => {
      const k = draftKey(workspaceId, sessionId)
      for (const a of s.attachments[k] ?? []) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
      const next = { ...s.attachments }
      delete next[k]
      return { attachments: next }
    }),

  renameSession: (workspaceId, from, to) =>
    set(s => {
      const fromKey = key(workspaceId, from)
      const toKey = key(workspaceId, to)
      const processing = { ...s.processing }
      const errors = { ...s.errors }
      if (fromKey in processing) {
        processing[toKey] = processing[fromKey]
        delete processing[fromKey]
      }
      if (fromKey in errors) {
        errors[toKey] = errors[fromKey]
        delete errors[fromKey]
      }
      const activeByWorkspace =
        s.activeByWorkspace[workspaceId] === from
          ? { ...s.activeByWorkspace, [workspaceId]: to }
          : s.activeByWorkspace
      return { processing, errors, activeByWorkspace }
    })
}))

// Reactive selector hook bound to the singleton store.
export function useLive<T>(selector: (state: LiveStore) => T): T {
  return useStore(liveStore, selector)
}
