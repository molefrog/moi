// The workspace's tab address: which tab the URL names, how to navigate
// elsewhere, and the persistence that keeps a bare `/workspace/:id` landing
// somewhere sensible. The URL is the live truth for the active tab; the
// persisted layout keeps the open set and the saved DEFAULT (`tabs.active`).
//
// Everything that merely reacts to navigation stays with the screen: tab-bar
// policy (close, reorder, availability pruning), view-builder lifecycle, the
// applet-runtime `focusTab` subscription, and the `moi tab focus` subscription.
// They all route through the `navigateToTab` returned here, so every origin —
// tab click, applet, CLI — shares one code path.
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useLocation, useParams } from 'wouter'
import { useHistoryState } from 'wouter/use-browser-location'

import { reportAppletError } from '@/client/features/applets/applet-log'
import { clearTabAddress, publishTabAddress } from '@/client/features/workspace/moi-context'
import {
  isStaleTabLink,
  normalizeTabsState,
  resolveActiveTab
} from '@/client/features/workspace/tab-resolution'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import type { ViewBuilder, ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import {
  parseWorkspaceTab,
  readAppletParams,
  viewIdFromTab,
  workspaceTabPath
} from '@/lib/workspace-tabs'

type UseWorkspaceNavigationOptions = {
  // What exists right now — a URL naming anything else falls back to the
  // default, the same way a stale bookmark does.
  views: ViewInfo[]
  builders: ViewBuilder[]
  // Split mode docks the chat in its own column, so the agent tab is not a
  // navigable tab there.
  split: boolean
}

export function useWorkspaceNavigation({ views, builders, split }: UseWorkspaceNavigationOptions) {
  const { layout, setLayout, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  // The tab id is the route's wildcard segment, read from the matched route
  // instead of threaded down as a prop — so the pattern stays in AppRouter and
  // can't drift from a second copy here.
  const urlTab = useParams()['*'] ?? null
  // Applet params ride navigation state; anything malformed reads as {}. A
  // stateless navigation (plain tab click) clears it, so views mount empty.
  const historyState = useHistoryState<unknown>()
  const appletParams = useMemo(() => readAppletParams(historyState), [historyState])

  const tabsState = normalizeTabsState(layout.tabs)
  // Mirror for the effects below: a debounced layout PUT can still be in flight
  // when a `workspace:updated` refetch lands, so reading the render-time value
  // could persist a stale open set (and resurrect a just-closed tab).
  const tabsStateRef = useRef(tabsState)
  tabsStateRef.current = tabsState

  const requestedTab = parseWorkspaceTab(urlTab)
  const activeTab = resolveActiveTab(requestedTab, tabsState, views, builders, split)
  const urlTabHonored = requestedTab !== null && requestedTab === activeTab

  // Every tab switch is a replace-navigation — never push, so Back leaves the
  // workspace instead of walking tab history.
  const navigateToTab = useCallback(
    (tab: WorkspaceTabId, params?: Record<string, unknown>) => {
      navigate(workspaceTabPath(workspaceId, tab), {
        replace: true,
        // Only a focus navigation carries params; omitting the key clears
        // history state, which is how a plain tab click resets them.
        ...(params ? { state: { appletParams: params } } : {})
      })
    },
    [navigate, workspaceId]
  )

  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      tabsStateRef.current = tabs
      setLayout({ tabs })
    },
    [setLayout]
  )

  // Keep the URL honest. One redirect covers every case: a bare
  // /workspace/:id, an unknown or dead tab, and the agent tab while split mode
  // hides it.
  useEffect(() => {
    if (urlTab === activeTab) return
    // A URL that named a view and didn't get it is a stale link — a deleted
    // view, an old bookmark, a `focusTab` the agent wrote against a view it
    // later renamed. The agent can't see the redirect happen, so journal it
    // for `moi debug logs`.
    if (isStaleTabLink(urlTab)) reportDeadTab(workspaceId, urlTab, activeTab)
    navigateToTab(activeTab)
  }, [activeTab, navigateToTab, urlTab, workspaceId])

  // Publish the settled address for the chat envelope (see moi-context.ts).
  // Only an honored URL publishes: mid-redirect the address is about to change,
  // and a message sent in that window should carry where the user lands.
  useEffect(() => {
    if (!urlTabHonored) return
    publishTabAddress(workspaceId, activeTab, appletParams)
  }, [activeTab, appletParams, urlTabHonored, workspaceId])

  useEffect(() => () => clearTabAddress(workspaceId), [workspaceId])

  // Navigating IS the tab switch, so persist its effects through the same write
  // path as before: the saved default follows the URL, and a URL-navigated tab
  // missing from the open set is auto-added. Only an honored URL writes —
  // redirects settle into an honored URL first, which is what stops this and
  // the redirect effect above from ping-ponging.
  useEffect(() => {
    if (!urlTabHonored) return
    const current = tabsStateRef.current
    const open = current.open.includes(activeTab) ? current.open : [...current.open, activeTab]
    if (open === current.open && current.active === activeTab) return
    setTabs({ open, active: activeTab })
  }, [activeTab, setTabs, urlTabHonored])

  return { tabsState, activeTab, appletParams, navigateToTab, setTabs }
}

// Journal a stale link (see `isStaleTabLink` for which URLs qualify).
// Attributed to the view when the dead id names one — that's the file the agent
// would fix, and the entry then clears the moment a view by that name builds.
// A malformed segment names no applet and lands unattributed. The journal's own
// dedup keeps a redirect loop to a single line.
function reportDeadTab(workspaceId: string, urlTab: string, activeTab: WorkspaceTabId): void {
  const requested = parseWorkspaceTab(urlTab)
  const viewId = requested ? viewIdFromTab(requested) : null
  reportAppletError(workspaceId, {
    source: 'runtime',
    ...(viewId ? { kind: 'view' as const, name: viewId } : {}),
    message: `Tab "${urlTab}" does not exist in this workspace — the URL redirected to "${activeTab}". A link, bookmark, or focusTab call is pointing at a tab that was deleted or renamed.`
  })
}
