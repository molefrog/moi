import { create } from 'zustand'

import type { WorkspaceLayout } from '@/lib/types'

const DEFAULT_LAYOUT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  chatMode: 'sidebar'
}

type WorkspaceStore = {
  id: string
  cwd: string | null
  name: string | null
  layout: WorkspaceLayout
  status: 'loading' | 'ready' | 'error'
  activeSessionId: string | null
  load: (id: string) => Promise<void>
  setLayout: (update: Partial<WorkspaceLayout>) => void
  setActiveSession: (sessionId: string | null) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  id: 'default',
  cwd: null,
  name: null,
  layout: DEFAULT_LAYOUT,
  status: 'loading',
  activeSessionId: null,

  load: async (id: string) => {
    set({ id })
    try {
      const res = await fetch(`/_mei/${id}/layout`)
      if (!res.ok) throw new Error()
      const { cwd, name, ...layout } = await res.json()
      // Strip the server-only `agentId` so it doesn't end up in the
      // persisted layout object (rest carries `version`, `widgetGrid`,
      // `chatMode`, `theme`).
      delete (layout as Record<string, unknown>).agentId
      set({ cwd: cwd ?? null, name: name ?? null, layout, status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },

  setLayout: update => {
    const { id } = get()
    const next = { ...get().layout, ...update }
    set({ layout: next })

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      fetch(`/_mei/${id}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      }).catch(() => {})
    }, 600)
  },

  setActiveSession: sessionId => set({ activeSessionId: sessionId })
}))
