import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Device-local UI preferences and onboarding markers, persisted to localStorage
// so they survive reloads. Server-owned workspace data does NOT belong here.
type UiStore = {
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromMoi: boolean
  workspaceIdsPendingAnalysis: string[]
  skillAutoUpdateEnabled: boolean
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markWorkspacePendingAnalysis: (workspaceId: string) => void
  markMessageSentFromMoi: (workspaceId: string) => void
  enableSkillAutoUpdate: () => void
}

export const useUiStore = create<UiStore>()(
  persist(
    set => ({
      discoveredWorkspacesOpen: true,
      hasSentMessageFromMoi: false,
      workspaceIdsPendingAnalysis: [],
      skillAutoUpdateEnabled: false,
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
        })),
      enableSkillAutoUpdate: () => set({ skillAutoUpdateEnabled: true })
    }),
    { name: 'moi:ui' }
  )
)
