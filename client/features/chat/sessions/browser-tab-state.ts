import type { WorkspaceSessionSelection } from '@/lib/types'

const keyFor = (workspaceId: string) => `moi:collab:${workspaceId}:session`
const emptySelection = (): WorkspaceSessionSelection => ({ selected: {}, pinned: null })

// Collab keeps each browser tab's unpinned chat choice, including a separate
// selection for every workspace tab. The workspace pin remains server-owned.
export function readSelectedSession(workspaceId: string): WorkspaceSessionSelection {
  try {
    const saved = sessionStorage.getItem(keyFor(workspaceId))
    if (!saved) return emptySelection()
    // The first Collab build stored only the overview chat ID.
    if (!saved.startsWith('{')) return { selected: { overview: saved }, pinned: null }
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
      ),
      pinned: null
    }
  } catch {
    return emptySelection()
  }
}

export function writeSelectedSession(
  workspaceId: string,
  selection: WorkspaceSessionSelection
): void {
  try {
    sessionStorage.setItem(keyFor(workspaceId), JSON.stringify({ selected: selection.selected }))
  } catch {
    // The in-memory query still works when browser storage is denied.
  }
}
