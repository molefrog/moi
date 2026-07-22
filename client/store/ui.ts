import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Global, device-local UI preferences — persisted to localStorage so they
// survive reloads. Server-owned or per-workspace state does NOT belong here.
type UiStore = {
  sidebarCollapsed: boolean
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromMoi: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markMessageSentFromMoi: () => void
}

export const useUiStore = create<UiStore>()(
  persist(
    set => ({
      sidebarCollapsed: false,
      discoveredWorkspacesOpen: true,
      hasSentMessageFromMoi: false,
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: collapsed => set({ sidebarCollapsed: collapsed }),
      setDiscoveredWorkspacesOpen: open => set({ discoveredWorkspacesOpen: open }),
      markMessageSentFromMoi: () => set({ hasSentMessageFromMoi: true })
    }),
    { name: 'moi:ui' }
  )
)
