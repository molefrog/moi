import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'

// Device-local UI preferences and onboarding markers, persisted to localStorage
// so they survive reloads. Server-owned workspace data does NOT belong here.
type UiStore = {
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromMoi: boolean
  workspaceIdsPendingAnalysis: string[]
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markWorkspacePendingAnalysis: (workspaceId: string) => void
  markMessageSentFromMoi: (workspaceId: string) => void
}

export const createUiStore = (storage?: StateStorage) =>
  create<UiStore>()(
    persist(
      set => ({
        discoveredWorkspacesOpen: true,
        hasSentMessageFromMoi: false,
        workspaceIdsPendingAnalysis: [],
        setDiscoveredWorkspacesOpen: open => set({ discoveredWorkspacesOpen: open }),
        markWorkspacePendingAnalysis: workspaceId =>
          set(state => {
            const workspaceIds = state.workspaceIdsPendingAnalysis ?? []
            return {
              workspaceIdsPendingAnalysis: workspaceIds.includes(workspaceId)
                ? workspaceIds
                : [...workspaceIds, workspaceId]
            }
          }),
        markMessageSentFromMoi: workspaceId =>
          set(state => ({
            hasSentMessageFromMoi: true,
            workspaceIdsPendingAnalysis: (state.workspaceIdsPendingAnalysis ?? []).filter(
              id => id !== workspaceId
            )
          }))
      }),
      storage
        ? {
            name: 'moi:ui',
            storage: createJSONStorage<UiStore>(() => storage)
          }
        : { name: 'moi:ui' }
    )
  )

export const useUiStore = createUiStore()
