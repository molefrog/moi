// Pure tab-state derivation for the workspace screen. The URL is the live
// truth for the active tab (`/workspace/:id/views/<id>`, etc.); the persisted layout
// keeps the open set and the saved DEFAULT tab (`tabs.active`). These helpers
// turn (URL segment + layout + what actually exists) into the rendered state.
import type { ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import { viewIdFromTab } from '@/lib/workspace-tabs'
import { createDefaultWorkspaceTabs, normalizeWorkspaceTabs } from '@/lib/workspace-layout'

const DEFAULT_TABS = createDefaultWorkspaceTabs()

export function normalizeTabsState(tabs: WorkspaceTabsState | undefined): WorkspaceTabsState {
  return normalizeWorkspaceTabs(tabs)
}

// Whether a tab id points at something that exists: static tabs always do,
// view tabs only while their pending or compiled view exists.
export function tabAvailable(tab: WorkspaceTabId, views: ViewInfo[]) {
  if (tab === 'overview' || tab === 'scratchpad') return true
  const viewId = viewIdFromTab(tab)
  return viewId ? views.some(view => view.id === viewId) : false
}

// The effective open set: persisted open tabs filtered to what exists, falling
// back to the defaults when nothing survives.
export function effectiveOpenTabs(tabs: WorkspaceTabsState, views: ViewInfo[]): WorkspaceTabId[] {
  const open = tabs.open.filter(tab => tabAvailable(tab, views))
  return open.length > 0 ? open : DEFAULT_TABS.open
}

// An explicit URL keeps its destination, including a missing view so the host
// can show recovery and report the correct address to the agent. A bare URL
// uses the saved default.
export function resolveActiveTab(
  requested: WorkspaceTabId | null,
  tabs: WorkspaceTabsState,
  views: ViewInfo[]
): WorkspaceTabId {
  if (requested !== null) {
    return requested
  }
  const open = effectiveOpenTabs(tabs, views)
  return open.includes(tabs.active) ? tabs.active : (open[0] ?? 'overview')
}
