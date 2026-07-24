import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Device-local UI preferences and onboarding markers, persisted to localStorage
// so they survive reloads. Server-owned workspace data does NOT belong here.
type UiStore = {
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromMoi: boolean
  workspaceIdsPendingAnalysis: string[]
  skillUpdatePromptDisabledWorkspaceIds: string[]
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markWorkspacePendingAnalysis: (workspaceId: string) => void
  markMessageSentFromMoi: (workspaceId: string) => void
  disableSkillUpdatePrompt: (workspaceId: string) => void
}

export const useUiStore = create<UiStore>()(
  persist(
    set => ({
      discoveredWorkspacesOpen: true,
      hasSentMessageFromMoi: false,
      workspaceIdsPendingAnalysis: [],
      skillUpdatePromptDisabledWorkspaceIds: [],
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
      disableSkillUpdatePrompt: workspaceId =>
        set(state => {
          const workspaceIds = state.skillUpdatePromptDisabledWorkspaceIds ?? []
          return {
            skillUpdatePromptDisabledWorkspaceIds: workspaceIds.includes(workspaceId)
              ? workspaceIds
              : [...workspaceIds, workspaceId]
          }
        })
    }),
    { name: 'moi:ui' }
  )
)
