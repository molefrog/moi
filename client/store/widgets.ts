import { create } from 'zustand'

import type { WidgetInfo } from '@/lib/types'

type WidgetsStore = {
  widgets: WidgetInfo[]
  status: 'loading' | 'ready' | 'error'
  load: (id: string) => Promise<void>
}

export const useWidgetsStore = create<WidgetsStore>()(set => ({
  widgets: [],
  status: 'loading',

  load: async (id: string) => {
    try {
      const res = await fetch(`/_mei/${id}/widgets`)
      if (!res.ok) throw new Error()
      const { widgets }: { widgets: WidgetInfo[] } = await res.json()
      set({ widgets, status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  }
}))
