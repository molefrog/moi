import { create } from 'zustand'

import type { ChatMessage, SessionInfo } from '@/lib/types'

type SessionsStore = {
  messages: Record<string, ChatMessage[]>
  processing: Record<string, boolean>
  list: SessionInfo[]
  status: 'loading' | 'ready' | 'error'
  initialSessionId: string | null
  setMessages: (sessionId: string, msgs: ChatMessage[]) => void
  append: (sessionId: string, msg: ChatMessage) => void
  setProcessing: (sessionId: string, value: boolean) => void
  renameSession: (from: string, to: string) => void
  loadList: (workspaceId: string) => Promise<void>
  loadMessages: (workspaceId: string, sessionId: string) => Promise<void>
  loadInitial: (workspaceId: string) => Promise<void>
}

export const useSessionsStore = create<SessionsStore>()(set => ({
  messages: {},
  processing: {},
  list: [],
  status: 'loading',
  initialSessionId: null,

  loadList: async (workspaceId: string) => {
    try {
      const res = await fetch(`/_mei/${workspaceId}/sessions`)
      if (!res.ok) return
      const list: SessionInfo[] = await res.json()
      set({ list })
    } catch {}
  },

  loadMessages: async (workspaceId: string, sessionId: string) => {
    try {
      const res = await fetch(`/_mei/${workspaceId}/sessions/${sessionId}/messages`)
      if (!res.ok) return
      const msgs: ChatMessage[] = await res.json()
      set(s => ({ messages: { ...s.messages, [sessionId]: msgs } }))
    } catch {}
  },

  // Initial app load: fetch sessions list + messages for the latest session in parallel
  loadInitial: async (workspaceId: string) => {
    try {
      const listRes = await fetch(`/_mei/${workspaceId}/sessions`)
      if (!listRes.ok) throw new Error()
      const list: SessionInfo[] = await listRes.json()

      if (list.length === 0) {
        set({ list, status: 'ready', initialSessionId: null })
        return
      }

      const latestId = list[0].sessionId
      const msgsRes = await fetch(`/_mei/${workspaceId}/sessions/${latestId}/messages`)
      if (!msgsRes.ok) throw new Error()
      const msgs: ChatMessage[] = await msgsRes.json()

      set(s => ({
        list,
        messages: { ...s.messages, [latestId]: msgs },
        status: 'ready',
        initialSessionId: latestId
      }))
    } catch {
      set({ status: 'error' })
    }
  },

  setMessages: (sessionId, msgs) => set(s => ({ messages: { ...s.messages, [sessionId]: msgs } })),

  append: (sessionId, msg) =>
    set(s => ({
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] ?? []), msg]
      }
    })),

  setProcessing: (sessionId, value) =>
    set(s => ({ processing: { ...s.processing, [sessionId]: value } })),

  renameSession: (from, to) =>
    set(s => {
      const messages = { ...s.messages }
      const processing = { ...s.processing }
      if (from in messages) {
        messages[to] = messages[from]
        delete messages[from]
      }
      if (from in processing) {
        processing[to] = processing[from]
        delete processing[from]
      }
      return { messages, processing }
    })
}))
