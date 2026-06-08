import { type ReactNode, createContext, useContext, useEffect, useRef } from 'react'

import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { applyEvent, emptyViewState } from '@/lib/format'
import type { StreamEvent, ViewState } from '@/lib/types'

// Per-workspace chat state: which thread is active, plus per-session
// events/views/status. One store instance per mounted workspace (created by
// ChatStoreProvider), so switching workspaces tears it down — nothing bleeds
// across workspaces and `activeSessionId` is naturally scoped to one.
//
// The session *list* is server data and lives in React Query
// (useWorkspaceSessions). This store holds only client-only state that can't be
// re-fetched: the live event stream, its materialized view, optimistic turns,
// processing flags, and errors. `events`/`views` are kept as a working copy
// (rather than derived from React Query) so live websocket frames fold in
// incrementally via applyEvent instead of re-reducing the whole log per frame.
export type ChatStore = {
  // The agent's working directory (workspace path), shown in turn metadata.
  cwd: string | null
  setCwd: (cwd: string | null) => void

  // The session/thread currently shown.
  activeSessionId: string | null
  setActiveSession: (sessionId: string | null) => void

  // Per-session state, keyed by sessionId.
  events: Record<string, StreamEvent[]>
  views: Record<string, ViewState>
  processing: Record<string, boolean>
  // Last server-emitted error per session — surfaced as a dismissable banner
  // above the chat. Cleared when the user types or stops the run.
  errors: Record<string, string | null>

  setEvents: (sessionId: string, evs: StreamEvent[]) => void
  append: (sessionId: string, ev: StreamEvent) => void
  setProcessing: (sessionId: string, value: boolean) => void
  setError: (sessionId: string, message: string | null) => void
  renameSession: (from: string, to: string) => void
  loadEvents: (workspaceId: string, sessionId: string) => Promise<void>
}

async function fetchEvents(workspaceId: string, sessionId: string): Promise<StreamEvent[]> {
  const res = await fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}/events`)
  if (!res.ok) return []
  return (await res.json()) as StreamEvent[]
}

function materialize(events: StreamEvent[]): ViewState {
  return events.reduce(applyEvent, emptyViewState())
}

export function createChatStore(initial: { cwd: string | null }) {
  return createStore<ChatStore>()(set => ({
    cwd: initial.cwd,
    setCwd: cwd => set({ cwd }),

    activeSessionId: null,
    setActiveSession: sessionId => set({ activeSessionId: sessionId }),

    events: {},
    views: {},
    processing: {},
    errors: {},

    loadEvents: async (workspaceId: string, sessionId: string) => {
      const evs = await fetchEvents(workspaceId, sessionId)
      set(s => ({
        events: { ...s.events, [sessionId]: evs },
        views: { ...s.views, [sessionId]: materialize(evs) }
      }))
    },

    setEvents: (sessionId, evs) =>
      set(s => ({
        events: { ...s.events, [sessionId]: evs },
        views: { ...s.views, [sessionId]: materialize(evs) }
      })),

    append: (sessionId, ev) =>
      set(s => {
        const prior = s.events[sessionId] ?? []
        const priorView = s.views[sessionId] ?? emptyViewState()
        return {
          events: { ...s.events, [sessionId]: [...prior, ev] },
          views: { ...s.views, [sessionId]: applyEvent(priorView, ev) }
        }
      }),

    setProcessing: (sessionId, value) =>
      set(s => ({ processing: { ...s.processing, [sessionId]: value } })),

    setError: (sessionId, message) => set(s => ({ errors: { ...s.errors, [sessionId]: message } })),

    renameSession: (from, to) =>
      set(s => {
        const events = { ...s.events }
        const views = { ...s.views }
        const processing = { ...s.processing }
        const errors = { ...s.errors }
        if (from in events) {
          events[to] = events[from]
          delete events[from]
        }
        if (from in views) {
          views[to] = views[from]
          delete views[from]
        }
        if (from in processing) {
          processing[to] = processing[from]
          delete processing[from]
        }
        if (from in errors) {
          errors[to] = errors[from]
          delete errors[from]
        }
        return { events, views, processing, errors }
      })
  }))
}

export type ChatStoreApi = ReturnType<typeof createChatStore>

const ChatStoreContext = createContext<ChatStoreApi | null>(null)

type ChatStoreProviderProps = {
  // Workspace path, threaded into the store so turn metadata can show it.
  cwd: string | null
  children: ReactNode
}

// Creates one chat store per mount and provides it to the subtree. Mount maps
// to a workspace, so unmounting (a workspace switch) discards all of its chat
// state cleanly.
export function ChatStoreProvider({ cwd, children }: ChatStoreProviderProps) {
  const storeRef = useRef<ChatStoreApi | null>(null)
  if (storeRef.current === null) storeRef.current = createChatStore({ cwd })

  // Layout (and therefore cwd) resolves after mount; keep the store in sync.
  useEffect(() => {
    storeRef.current?.getState().setCwd(cwd)
  }, [cwd])

  return <ChatStoreContext value={storeRef.current}>{children}</ChatStoreContext>
}

// Reactive selector hook — re-renders when the selected slice changes.
export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const store = useContext(ChatStoreContext)
  if (!store) throw new Error('useChatStore must be used within a ChatStoreProvider')
  return useStore(store, selector)
}

// The raw store handle — for imperative reads/writes (getState/setState) and
// for handing to the non-React websocket layer.
export function useChatStoreApi(): ChatStoreApi {
  const store = useContext(ChatStoreContext)
  if (!store) throw new Error('useChatStoreApi must be used within a ChatStoreProvider')
  return store
}
