import { useCallback, useEffect, useMemo } from 'react'
import type { MouseEvent } from 'react'
import { useLocation, useRouter } from 'wouter'
import { usePathname, useSearch } from 'wouter/use-browser-location'

import { toast } from '@/client/components/ui/toast'
import { reportAppletError } from '@/client/features/applets/applet-log'
import { useAppletEvent } from '@/client/features/applets/applet-runtime'
import { normalizeTabsState, resolveActiveTab, tabAvailable } from './tab-resolution'
import { useWorkspaceLayoutCtx } from './WorkspaceLayoutContext'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import { useNavigationClient } from '@/client/runtime/useWorkspaceEvents'
import type { ViewBuilder, ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import {
  addressPath,
  canonicalSearch,
  legacyTabFromPath,
  parseMoiHref,
  readViewParams,
  resolveWorkspaceHref,
  tabFromPath,
  workspacePath
} from '@/lib/navigation'
type NavigationOptions = { replace?: boolean }

// A convenience for returning to tabs, never a second source of active state.
// Memory-only, and scoped by workspace so switching workspaces cannot leak params.
const rememberedAddresses = new Map<string, Map<WorkspaceTabId, string>>()

type UseWorkspaceNavigationOptions = { views: ViewInfo[]; builders: ViewBuilder[]; split: boolean }

export function useWorkspaceNavigation({ views, builders, split }: UseWorkspaceNavigationOptions) {
  const { layout, setLayout, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  const router = useRouter()
  const { base } = router
  // wouter's public route/search hooks decode URI escapes already. Read raw
  // browser values so tabFromPath and URLSearchParams each decode only once.
  const path = usePathname(router).slice(workspacePath(workspaceId, base).length + 1)
  const search = canonicalSearch(useSearch(router))
  const appletParams = useMemo(() => readViewParams(search), [search])
  const tabsState = normalizeTabsState(layout.tabs)
  const tabsStateRef = useLatestRef(tabsState)
  const remembered = useMemo(() => {
    let entries = rememberedAddresses.get(workspaceId)
    if (!entries) rememberedAddresses.set(workspaceId, (entries = new Map()))
    return entries
  }, [workspaceId])
  const requestedTab = tabFromPath(path)
  const legacyTab = requestedTab ? null : legacyTabFromPath(path)
  const activeTab = resolveActiveTab(requestedTab ?? legacyTab, tabsState, views, builders, split)
  const isUnavailable =
    Boolean(path) && !legacyTab && (!requestedTab || !tabAvailable(requestedTab, views, builders))
  const honored = requestedTab === activeTab && !isUnavailable

  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      tabsStateRef.current = tabs
      setLayout({ tabs })
    },
    [setLayout, tabsStateRef]
  )

  const go = useCallback(
    (target: string, options: NavigationOptions = {}) => {
      const current = window.location.pathname + canonicalSearch(window.location.search)
      const absolute = `${base}${target}`
      if (current !== absolute || window.location.hash) navigate(target, options)
    },
    [base, navigate]
  )

  const navigateToTab = useCallback(
    (tab: WorkspaceTabId, options: NavigationOptions = {}) => {
      go(remembered.get(tab) ?? addressPath(workspaceId, { tab, search: '' }), options)
    },
    [go, remembered, workspaceId]
  )

  const navigateHref = useCallback(
    (href: string) => {
      if (!href.startsWith('moi:')) {
        const target = resolveWorkspaceHref(workspaceId, href, base)
        window.location.assign(target)
        return
      }
      const address = parseMoiHref(href)
      if (!tabAvailable(address.tab, views, builders))
        throw new Error('This destination is unavailable in this workspace')
      go(addressPath(workspaceId, address))
    },
    [base, builders, go, views, workspaceId]
  )

  const reportError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Navigation failed'
      toast.add({ type: 'error', title: 'Could not navigate', description: message })
      reportAppletError(workspaceId, { source: 'runtime', message })
    },
    [workspaceId]
  )

  useAppletEvent(workspaceId, 'navigate', href => {
    try {
      navigateHref(href)
    } catch (error) {
      reportError(error)
    }
  })
  useNavigationClient(workspaceId, navigateHref)

  // Bare workspace URLs, old bookmarks, and hidden singleton chat routes are
  // the only redirects. Missing destinations keep their URL and show recovery.
  useEffect(() => {
    if (isUnavailable) return
    if (legacyTab) {
      go(addressPath(workspaceId, { tab: legacyTab, search }), { replace: true })
    } else if (!path || (requestedTab === 'agent' && split)) {
      navigateToTab(activeTab, { replace: true })
    }
  }, [
    activeTab,
    go,
    legacyTab,
    navigateToTab,
    path,
    requestedTab,
    search,
    split,
    isUnavailable,
    workspaceId
  ])

  useEffect(() => {
    if (!honored) return
    remembered.set(activeTab, addressPath(workspaceId, { tab: activeTab, search }))
    const current = tabsStateRef.current
    const open = current.open.includes(activeTab) ? current.open : [...current.open, activeTab]
    if (open !== current.open || current.active !== activeTab) setTabs({ open, active: activeTab })
  }, [activeTab, honored, remembered, search, setTabs, tabsStateRef, workspaceId])

  // React bubbling includes applet/chat portals. Native modified clicks and
  // downloads keep a real href, so the browser can handle them normally.
  const onNavigationClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      )
        return
      const url = new URL(anchor.href)
      const prefix = workspacePath(workspaceId, base) + '/'
      if (url.origin !== window.location.origin || !url.pathname.startsWith(prefix)) return
      // In-page fragments continue using native browser behavior.
      if (url.hash) return
      const tab = tabFromPath(url.pathname.slice(prefix.length))
      if (!tab) return
      event.preventDefault()
      try {
        if (!tabAvailable(tab, views, builders))
          throw new Error('This destination is unavailable in this workspace')
        go(addressPath(workspaceId, { tab, search: canonicalSearch(url.search) }))
      } catch (error) {
        reportError(error)
      }
    },
    [base, builders, go, reportError, views, workspaceId]
  )

  return {
    tabsState,
    activeTab,
    appletParams,
    navigateToTab,
    setTabs,
    isUnavailable,
    onNavigationClick
  }
}
