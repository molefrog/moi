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
  layout: WorkspaceLayout
  status: 'loading' | 'ready' | 'error'
  load: (id: string) => Promise<void>
  setLayout: (update: Partial<WorkspaceLayout>) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  id: 'default',
  cwd: null,
  layout: DEFAULT_LAYOUT,
  status: 'loading',

  load: async (id: string) => {
    set({ id })
    try {
      const res = await fetch(`/_mei/${id}/layout`)
      if (!res.ok) throw new Error()
      const { cwd, ...layout } = await res.json()
      set({ cwd: cwd ?? null, layout, status: 'ready' })
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
  }
}))
