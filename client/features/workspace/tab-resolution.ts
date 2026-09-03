// Pure tab-state derivation for the workspace screen. The URL is the live
// truth for the active tab (`/workspace/:id/<tab>`); the persisted layout
// keeps the open set and the saved DEFAULT tab (`tabs.active`). These helpers
// turn (URL segment + layout + what actually exists) into the rendered state.
import type { ViewBuilder, ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import { parseWorkspaceTab, viewBuilderIdFromTab, viewIdFromTab } from '@/lib/workspace-tabs'
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

// Whether a URL segment that lost its redirect is worth reporting as a stale
// link (see the journaling in useWorkspaceNavigation). Only two shapes qualify:
// a view tab — `resolveActiveTab` honors every view that exists, so losing the
// redirect means it is gone — and a segment that isn't a tab id at all. The two
// deliberate exclusions are the routine redirects, not broken links: the agent
// tab bounces whenever split mode docks it as a column, and a view-builder tab
// bounces the moment its build finishes and the screen swaps in the real view.
export function isStaleTabLink(urlTab: string | null | undefined): urlTab is string {
  if (!urlTab) return false
  const requested = parseWorkspaceTab(urlTab)
  return requested === null || viewIdFromTab(requested) !== null
}

// The active tab for a URL-requested tab id: the request wins when it names an
// available tab (a requested tab missing from the open set is honored — the
// screen auto-adds it, like openTab does), EXCEPT the agent tab in split mode,
// which is the docked column there, not a workspace tab. Anything else — bare
// URL, unknown or unavailable tab — resolves to the saved default run through
// the same availability fallbacks as before.
export function resolveActiveTab(
  requested: WorkspaceTabId | null,
  tabs: WorkspaceTabsState,
  views: ViewInfo[],
  builders: ViewBuilder[],
  split: boolean
): WorkspaceTabId {
  if (
    requested !== null &&
    tabAvailable(requested, views, builders) &&
    !(split && requested === 'agent')
  ) {
    return requested
  }
  const open = effectiveOpenTabs(tabs, views, builders)
  const visible = split ? open.filter(tab => tab !== 'agent') : open
  return visible.includes(tabs.active) ? tabs.active : (visible[0] ?? 'overview')
}
