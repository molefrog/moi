// Tab discovery and server-side validation for portable navigation addresses.
import type { ViewInfo, WorkspaceTabId } from '@/lib/types'
import { moiHref, parseMoiHref } from '@/lib/navigation'
import { viewIdFromTab, viewTabId } from '@/lib/workspace-tabs'

// One row of `moi tabs`. `isDefault` marks the workspace's saved default tab
// (`layout.tabs.active`) — where a bare `/workspace/:id` lands.
export type TabRow = {
  id: WorkspaceTabId
  title: string
  isDefault: boolean
  href?: string
}

// The always-present tabs, titled like the tab bar renders them.
const STATIC_TABS: { id: WorkspaceTabId; title: string }[] = [
  { id: 'overview', title: 'Overview' },
  { id: 'agent', title: 'Agent' },
  { id: 'scratchpad', title: 'Scratchpad' }
]

// The `moi tabs` listing: static tabs plus each built view, the saved default
// marked. View builders are transient build-state, not addressable tabs, so
// they don't list (and a builder default simply marks no row).
export function assembleTabRows(views: ViewInfo[], defaultTab: WorkspaceTabId): TabRow[] {
  return [
    ...STATIC_TABS,
    ...views.map(view => ({ id: viewTabId(view.id), title: view.config.title || view.id }))
  ].map(row => ({
    ...row,
    isDefault: row.id === defaultTab,
    ...(row.id === 'agent' ? {} : { href: moiHref(row.id) })
  }))
}

type NavigationDeps = {
  // Whether a view id exists in the workspace (source or built) — hasViewId.
  hasView: (viewId: string) => Promise<boolean>
}

export type NavigationResult = { ok: true; href: string } | { ok: false; error: string }

export async function resolveNavigation(
  raw: unknown,
  deps: NavigationDeps
): Promise<NavigationResult> {
  try {
    const address = parseMoiHref(raw)
    const viewId = viewIdFromTab(address.tab)
    if (viewId && !(await deps.hasView(viewId)))
      return { ok: false, error: `View "${viewId}" does not exist in this workspace.` }
    return { ok: true, href: moiHref(address.tab, address.search) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid workspace address'
    }
  }
}
