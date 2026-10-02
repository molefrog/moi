import type { WorkspaceLayout, WorkspaceLayoutSave } from '@/lib/types'

// Unrelated edits must omit tabs from the PUT. Keep the last explicit tab edit
// through the debounce window, even if a refetch replaces the optimistic cache.
export function accumulateLayoutSave(
  next: WorkspaceLayout,
  update: Partial<WorkspaceLayout>,
  pending: WorkspaceLayoutSave | null
): WorkspaceLayoutSave {
  const { tabs: _tabs, ...layout } = next
  const tabs = update.tabs ?? pending?.tabs
  return tabs === undefined ? layout : { ...layout, tabs }
}
