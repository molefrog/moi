import type { WorkspaceTabId } from '@/lib/types'

export type WorkspaceAnnotationMode = 'idle' | 'editing' | 'customizing'

export function canAnnotateWorkspaceContent(
  activeTab: WorkspaceTabId,
  widgetMode: WorkspaceAnnotationMode,
  hasBuiltView: boolean
): boolean {
  if (widgetMode !== 'idle') return false
  return activeTab === 'widgets' || (activeTab.startsWith('view:') && hasBuiltView)
}
