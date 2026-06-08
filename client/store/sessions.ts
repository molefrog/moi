import { create } from 'zustand'

import { applyEvent, emptyViewState } from '@/lib/format'
import type { SessionInfo, StreamEvent, ViewState } from '@/lib/types'

type SessionsStore = {
  events: Record<string, StreamEvent[]>
  views: Record<string, ViewState>
  processing: Record<string, boolean>
  // Last server-emitted error per session — surfaced as a dismissable banner
  // above the chat. Cleared when the user types or stops the run.
  errors: Record<string, string | null>
  list: SessionInfo[]
  status: 'loading' | 'ready' | 'error'
  initialSessionId: string | null
  setEvents: (sessionId: string, evs: StreamEvent[]) => void
  append: (sessionId: string, ev: StreamEvent) => void
  setProcessing: (sessionId: string, value: boolean) => void
  setError: (sessionId: string, message: string | null) => void
  renameSession: (from: string, to: string) => void
  loadList: (workspaceId: string) => Promise<void>
  loadEvents: (workspaceId: string, sessionId: string) => Promise<void>
  loadInitial: (workspaceId: string) => Promise<void>
}

async function fetchEvents(workspaceId: string, sessionId: string): Promise<StreamEvent[]> {
  const res = await fetch(`/_mei/${workspaceId}/sessions/${sessionId}/events`)
  if (!res.ok) return []
  return (await res.json()) as StreamEvent[]
}

function materialize(events: StreamEvent[]): ViewState {
  return events.reduce(applyEvent, emptyViewState())
}

export const useSessionsStore = create<SessionsStore>()(set => ({
  events: {},
  views: {},
  processing: {},
  errors: {},
  list: [],
  status: 'loading',
  initialSessionId: null,

  loadList: async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/sessions`)
      if (!res.ok) return
      const list: SessionInfo[] = await res.json()
      set({ list })
    } catch {}
  },

  loadEvents: async (workspaceId: string, sessionId: string) => {
    const evs = await fetchEvents(workspaceId, sessionId)
    set(s => ({
      events: { ...s.events, [sessionId]: evs },
      views: { ...s.views, [sessionId]: materialize(evs) }
    }))
  },

  loadInitial: async (workspaceId: string) => {
    try {
      const listRes = await fetch(`/api/workspaces/${workspaceId}/sessions`)
      if (!listRes.ok) throw new Error()
      const list: SessionInfo[] = await listRes.json()

      if (list.length === 0) {
        set({ list, status: 'ready', initialSessionId: null })
        return
      }

      const latestId = list[0].sessionId
      const evs = await fetchEvents(workspaceId, latestId)

      set(s => ({
        list,
        events: { ...s.events, [latestId]: evs },
        views: { ...s.views, [latestId]: materialize(evs) },
        status: 'ready',
        initialSessionId: latestId
      }))
    } catch {
      set({ status: 'error' })
    }
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
