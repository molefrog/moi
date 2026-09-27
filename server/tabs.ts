// Tab discovery with portable navigation addresses.
import type { ViewInfo, WorkspaceTabId } from '@/lib/types'
import { moiHref } from '@/lib/navigation'
import { viewTabId } from '@/lib/workspace-tabs'

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

// CLI navigation checks the server's current built-view list before asking a
// browser to move. The browser repeats the availability check in case its view
// list is stale in either direction.
export function assertNavigableTab(tab: WorkspaceTabId, views: ViewInfo[]): void {
  const rows = assembleTabRows(views, 'agent').filter(row => row.href)
  if (rows.some(row => row.id === tab)) return
  throw new Error(
    `Unknown destination "${moiHref(tab)}". Valid addresses: ${rows.map(row => row.href).join(', ')}`
  )
}
