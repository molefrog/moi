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
  popupChatWidth: number
  setDiscoveredWorkspacesOpen: (open: boolean) => void
  markWorkspacePendingAnalysis: (workspaceId: string) => void
  markMessageSentFromMoi: (workspaceId: string) => void
  setComposerDraft: (key: string, value: string | null) => void
  moveComposerDraft: (from: string, to: string) => void
  setDockedChatWidth: (width: number) => void
  setPopupChatWidth: (width: number) => void
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
        popupChatWidth: 440,
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
        setComposerDraft: (key, value) =>
          set(state => {
            if (
              value === null ? !(key in state.composerDrafts) : state.composerDrafts[key] === value
            )
              return state
            const composerDrafts = { ...state.composerDrafts }
            if (value === null) delete composerDrafts[key]
            else composerDrafts[key] = value
            return { composerDrafts }
          }),
        moveComposerDraft: (from, to) =>
          set(state => {
            if (from === to || !(from in state.composerDrafts)) return state
            const composerDrafts = { ...state.composerDrafts }
            composerDrafts[to] ??= composerDrafts[from]
            delete composerDrafts[from]
            return { composerDrafts }
          }),
        setDockedChatWidth: width => set({ dockedChatWidth: width }),
        setPopupChatWidth: width => set({ popupChatWidth: width })
      }),
      {
        name: 'moi:ui',
        ...(storage ? { storage: createJSONStorage<UiStore>(() => storage) } : {})
      }
    )
  )

export const useUiStore = createUiStore()
