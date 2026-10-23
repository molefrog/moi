import type { WorkspaceTabId } from '@/lib/types'

// Collab keeps each browser tab's unpinned chat choice, including a separate
// selection for every workspace tab. The workspace pin remains server-owned.
export type BrowserTabSelection = {
  // A browser tab can explicitly choose an empty chat (null). An absent key
  // inherits the server selection, including CLI-created view handoffs.
  selected: Partial<Record<WorkspaceTabId, string | null>>
}

const keyFor = (workspaceId: string) => `moi:collab:${workspaceId}:session`
const emptySelection = (): BrowserTabSelection => ({ selected: {} })

export function readSelectedSession(workspaceId: string): BrowserTabSelection {
  try {
    const saved = sessionStorage.getItem(keyFor(workspaceId))
    if (!saved) return emptySelection()
    // The first Collab build stored only the overview chat ID.
    if (!saved.startsWith('{')) return { selected: { overview: saved } }
    const value: unknown = JSON.parse(saved)
    if (!value || typeof value !== 'object' || !('selected' in value)) return emptySelection()
    const selected = (value as { selected: unknown }).selected
    if (!selected || typeof selected !== 'object' || Array.isArray(selected))
      return emptySelection()
    return {
      selected: Object.fromEntries(
        Object.entries(selected).filter(
          ([, sessionId]) => typeof sessionId === 'string' || sessionId === null
        )
      )
    }
  } catch {
    return emptySelection()
  }
}

export function writeSelectedSession(workspaceId: string, selection: BrowserTabSelection): void {
  try {
    sessionStorage.setItem(keyFor(workspaceId), JSON.stringify({ selected: selection.selected }))
  } catch {
    // The in-memory query still works when browser storage is denied.
  }
}
