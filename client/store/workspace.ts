import { create } from 'zustand'

import type { WorkspaceLayout } from '@/lib/types'

const WORKSPACE_ID = 'default'

const DEFAULT_LAYOUT: WorkspaceLayout = {
  version: 1,
  widgetGrid: [],
  chatMode: 'sidebar'
}

type WorkspaceStore = {
  id: string
  layout: WorkspaceLayout
  status: 'loading' | 'ready' | 'error'
  load: () => Promise<void>
  setLayout: (update: Partial<WorkspaceLayout>) => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  id: WORKSPACE_ID,
  layout: DEFAULT_LAYOUT,
  status: 'loading',

  load: async () => {
    try {
      const res = await fetch(`/_mei/${WORKSPACE_ID}/layout`)
      if (!res.ok) throw new Error()
      set({ layout: await res.json(), status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },

  setLayout: update => {
    const next = { ...get().layout, ...update }
    set({ layout: next })

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      fetch(`/_mei/${WORKSPACE_ID}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      }).catch(() => {})
    }, 600)
  }
}))
