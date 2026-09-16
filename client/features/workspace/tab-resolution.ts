// Pure tab-state derivation for the workspace screen. The URL is the live
// truth for the active tab (`/workspace/:id/views/<id>`, etc.); the persisted layout
// keeps the open set and the saved DEFAULT tab (`tabs.active`). These helpers
// turn (URL segment + layout + what actually exists) into the rendered state.
import type { ViewBuilder, ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import { viewBuilderIdFromTab, viewIdFromTab } from '@/lib/workspace-tabs'
import { createDefaultWorkspaceTabs, normalizeWorkspaceTabs } from '@/lib/workspace-layout'

const DEFAULT_TABS = createDefaultWorkspaceTabs()

export function normalizeTabsState(tabs: WorkspaceTabsState | undefined): WorkspaceTabsState {
  return normalizeWorkspaceTabs(tabs)
}

// Whether a tab id points at something that exists: static tabs always do,
// view/builder tabs only while their view or builder is around.
export function tabAvailable(tab: WorkspaceTabId, views: ViewInfo[], builders: ViewBuilder[]) {
  if (tab === 'agent' || tab === 'overview' || tab === 'scratchpad') return true
  const builderId = viewBuilderIdFromTab(tab)
  if (builderId) return builders.some(builder => builder.id === builderId)
  const viewId = viewIdFromTab(tab)
  return viewId ? views.some(v => v.id === viewId) : false
}

// The effective open set: persisted open tabs filtered to what exists, falling
// back to the defaults when nothing survives.
export function effectiveOpenTabs(
  tabs: WorkspaceTabsState,
  views: ViewInfo[],
  builders: ViewBuilder[]
): WorkspaceTabId[] {
  const open = tabs.open.filter(tab => tabAvailable(tab, views, builders))
  return open.length > 0 ? open : DEFAULT_TABS.open
}

// An explicit URL keeps its destination, including a missing view so the host
// can show recovery and report the correct address to the agent. Only a bare
// URL or the singleton chat hidden by split mode uses the saved default.
export function resolveActiveTab(
  requested: WorkspaceTabId | null,
  tabs: WorkspaceTabsState,
  views: ViewInfo[],
  builders: ViewBuilder[],
  split: boolean
): WorkspaceTabId {
  if (requested !== null && !(split && requested === 'agent')) {
    return requested
  }
  const open = effectiveOpenTabs(tabs, views, builders)
  const visible = split ? open.filter(tab => tab !== 'agent') : open
  return visible.includes(tabs.active) ? tabs.active : (visible[0] ?? 'overview')
}
