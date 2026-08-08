import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { StateStorage } from 'zustand/middleware'

// Per-browser UI preferences and onboarding markers, persisted to localStorage
// so they survive reloads. Server-backed per-user app state belongs in DATA_DIR.
type UiStore = {
  discoveredWorkspacesOpen: boolean
  hasSentMessageFromMoi: boolean
  workspaceIdsPendingAnalysis: string[]
  composerDrafts: Record<string, string>
  dockedChatWidth: number
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markWorkspacePendingAnalysis: (workspaceId: string) => void
  markMessageSentFromMoi: (workspaceId: string) => void
  setComposerDraft: (workspaceId: string, value: string) => void
  setDockedChatWidth: (width: number) => void
}

export const createUiStore = (storage?: StateStorage) =>
  create<UiStore>()(
    persist(
      set => ({
        discoveredWorkspacesOpen: true,
        hasSentMessageFromMoi: false,
        workspaceIdsPendingAnalysis: [],
        composerDrafts: {},
        dockedChatWidth: 360,
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
        setComposerDraft: (workspaceId, value) =>
          set(state => {
            const composerDrafts = { ...(state.composerDrafts ?? {}) }
            if (value) composerDrafts[workspaceId] = value
            else delete composerDrafts[workspaceId]
            return { composerDrafts }
          }),
        setDockedChatWidth: width => set({ dockedChatWidth: width })
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
