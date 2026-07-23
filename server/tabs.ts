// `moi tabs` / `moi tab focus` server logic: assemble the tab listing and
// validate a focus target. Pure given its inputs — the control handler wires
// in the workspace lookups (see control.ts), tests pass fakes.
import type { ViewInfo, WorkspaceTabId } from '@/lib/types'
import { viewIdFromTab, viewTabId } from '@/lib/workspace-tabs'

// One row of `moi tabs`. `isDefault` marks the workspace's saved default tab
// (`layout.tabs.active`) — where a bare `/workspace/:id` lands.
export type TabRow = {
  id: WorkspaceTabId
  title: string
  isDefault: boolean
}

// The always-present tabs, titled like the tab bar renders them.
const STATIC_TABS: { id: WorkspaceTabId; title: string }[] = [
  { id: 'agent', title: 'Agent' },
  { id: 'widgets', title: 'Widgets' },
  { id: 'scratchpad', title: 'Scratchpad' }
]

// The `moi tabs` listing: static tabs plus each built view, the saved default
// marked. View builders are transient build-state, not addressable tabs, so
// they don't list (and a builder default simply marks no row).
export function assembleTabRows(views: ViewInfo[], defaultTab: WorkspaceTabId): TabRow[] {
  return [
    ...STATIC_TABS,
    ...views.map(view => ({ id: viewTabId(view.id), title: view.config.title || view.id }))
  ].map(row => ({ ...row, isDefault: row.id === defaultTab }))
}

type FocusTabDeps = {
  // Whether a view id exists in the workspace (source or built) — hasViewId.
  hasView: (viewId: string) => Promise<boolean>
  // The built views, for the error message's valid-id list — getViewList.
  viewList: () => Promise<ViewInfo[]>
}

export type FocusTabResult = { ok: true; tab: WorkspaceTabId } | { ok: false; error: string }

// Validate a `moi tab focus` target: static ids pass as-is, `view:<id>` must
// name a real view. Anything else — including view-builder tabs — fails with
// the list of valid ids. Addressing is by tab id, never by title.
export async function resolveFocusTab(raw: unknown, deps: FocusTabDeps): Promise<FocusTabResult> {
  const tab = typeof raw === 'string' ? raw.trim() : ''
  if (STATIC_TABS.some(row => row.id === tab)) return { ok: true, tab: tab as WorkspaceTabId }

  const viewId = tab.startsWith('view:') ? viewIdFromTab(tab as WorkspaceTabId) : null
  if (viewId && (await deps.hasView(viewId))) return { ok: true, tab: tab as WorkspaceTabId }

  const validIds = [
    ...STATIC_TABS.map(row => row.id),
    ...(await deps.viewList()).map(view => viewTabId(view.id))
  ]
  return {
    ok: false,
    error: `Unknown tab "${tab || String(raw ?? '')}". Valid tabs: ${validIds.join(', ')}`
  }
}
