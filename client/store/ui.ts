import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Global, device-local UI preferences — persisted to localStorage so they
// survive reloads. Server-owned or per-workspace state does NOT belong here.
type UiStore = {
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromMoi: boolean
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markMessageSentFromMoi: () => void
}

export const useUiStore = create<UiStore>()(
  persist(
    set => ({
      discoveredWorkspacesOpen: true,
      hasSentMessageFromMoi: false,
      setDiscoveredWorkspacesOpen: open => set({ discoveredWorkspacesOpen: open }),
      markMessageSentFromMoi: () => set({ hasSentMessageFromMoi: true })
    }),
    { name: 'moi:ui' }
  )
)
