import type { WorkspaceTabId } from '@/lib/types'

export function canAnnotateWorkspaceContent(
  activeTab: WorkspaceTabId,
  widgetControlsIdle: boolean,
  hasBuiltView: boolean
): boolean {
  if (!widgetControlsIdle) return false
  return activeTab === 'widgets' || (activeTab.startsWith('view:') && hasBuiltView)
}
