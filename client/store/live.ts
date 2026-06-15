import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

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

export type LiveStore = {
  activeByWorkspace: Record<string, string | null>
  processing: Record<string, boolean>
  errors: Record<string, string | null>

  setActive: (workspaceId: string, sessionId: string | null) => void
  setProcessing: (workspaceId: string, sessionId: string, value: boolean) => void
  // Authoritative reconcile from a server `status_snapshot`: exactly the listed
  // sessions are processing; everything else is cleared (fixes a spinner whose
  // terminal status was emitted while we were disconnected).
  reconcileProcessing: (running: { workspaceId: string; sessionId: string }[]) => void
  setError: (workspaceId: string, sessionId: string, message: string | null) => void
  renameSession: (workspaceId: string, from: string, to: string) => void
}

export const liveStore = createStore<LiveStore>()(set => ({
  activeByWorkspace: {},
  processing: {},
  errors: {},

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
