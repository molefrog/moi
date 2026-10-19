import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from 'wouter'
import { usePathname, useSearch } from 'wouter/use-browser-location'

import { toast } from '@/client/components/ui/toast'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { reportAppletError } from '@/client/features/applets/applet-log'
import { useAppletEvent } from '@/client/features/applets/applet-runtime'
import { useWorkspaceTabs } from '@/client/features/workspace/browser-tab-state'
import { resolveActiveTab, tabAvailable } from './tab-resolution'
import { useWorkspaceLayoutCtx } from './WorkspaceLayoutContext'
import { useNavigationClient } from '@/client/runtime/useWorkspaceEvents'
import { useSelectLinkedChat } from '@/client/features/chat/sessions/api'
import type { ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import { resolveUrl } from '@/lib/navigation'
import { isWorkspaceTabId, tabFromPath } from '@/lib/workspace-tabs'
type NavigationOptions = { replace?: boolean }

function canonicalSearch(search: string): string {
  const params = new URLSearchParams(search)
  params.sort()
  const result = params.toString()
  return result ? `?${result}` : ''
}

function browserAddress(): string {
  return window.location.pathname + canonicalSearch(window.location.search)
}

function tabUrl(remembered: ReadonlyMap<WorkspaceTabId, string>, tab: WorkspaceTabId): string {
  return remembered.get(tab) ?? `moi:/${tab}`
}

// A convenience for returning to tabs, never a second source of active state.
// Memory-only, and scoped by workspace so switching workspaces cannot leak params.
const rememberedAddresses = new Map<string, Map<WorkspaceTabId, string>>()

type UseWorkspaceNavigationOptions = {
  views: ViewInfo[]
  onOpenChat: () => void
}

export function useWorkspaceNavigation({ views, onOpenChat }: UseWorkspaceNavigationOptions) {
  const queryClient = useQueryClient()
  const { workspaceId } = useWorkspaceLayoutCtx()
  const [tabsState, saveTabs] = useWorkspaceTabs()
  const latest = useRef({ views, tabsState, onOpenChat })
  useLayoutEffect(() => {
    latest.current = { views, tabsState, onOpenChat }
  }, [views, tabsState, onOpenChat])
  const selectLinkedChat = useSelectLinkedChat()
  const navigationRequest = useRef<{ controller: AbortController; address: string } | null>(null)
  const [, setLocation] = useLocation()
  const router = useRouter()
  const { base } = router
  // wouter's public route/search hooks decode URI escapes already. Read raw
  // browser values so tabFromPath and URLSearchParams each decode only once.
  const prefix = `${base.replace(/\/$/, '')}/workspace/${encodeURIComponent(workspaceId)}/`
  const path = usePathname(router).slice(prefix.length)
  const search = canonicalSearch(useSearch(router))
  const appletParams = useMemo(() => {
    const params = new URLSearchParams(search)
    return Object.fromEntries(Array.from(params.keys(), key => [key, params.get(key)!]))
  }, [search])
  const remembered = useMemo(() => {
    let entries = rememberedAddresses.get(workspaceId)
    if (!entries) rememberedAddresses.set(workspaceId, (entries = new Map()))
    return entries
  }, [workspaceId])
  const requestedTab = tabFromPath(path)
  const isChatLink = path === 'chat' || path === 'chats' || path.startsWith('chats/')
  const activeTab = resolveActiveTab(requestedTab, tabsState, views)
  const isUnavailable =
    Boolean(path) && !isChatLink && (!requestedTab || !tabAvailable(requestedTab, views))
  const isAvailableTab = requestedTab !== undefined && !isUnavailable

  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      // Keep same-turn tab changes visible to navigation.
      latest.current = { ...latest.current, tabsState: saveTabs(tabs) }
    },
    [latest, saveTabs]
  )

  const currentPage = useCallback(() => {
    const currentTab = tabFromPath(window.location.pathname.slice(prefix.length))
    const { tabsState, views } = latest.current
    const tab = currentTab ?? resolveActiveTab(undefined, tabsState, views)
    const href = currentTab ? `moi:/${tab}${window.location.search}` : tabUrl(remembered, tab)
    return { tab, href }
  }, [latest, prefix, remembered])

  const navigate = useCallback(
    async (
      href: string,
      { replace = false }: NavigationOptions = {},
      controller = new AbortController()
    ) => {
      const target = resolveUrl(href, { workspaceId, base })
      navigationRequest.current?.controller.abort()
      if (!target.startsWith(prefix)) {
        navigationRequest.current = null
        controller.signal.throwIfAborted()
        window.location.assign(target)
        return
      }
      navigationRequest.current = {
        controller,
        address: browserAddress()
      }
      const commit = (url: string) => {
        controller.signal.throwIfAborted()
        navigationRequest.current = null
        if (browserAddress() !== url || window.location.hash) setLocation(`~${url}`, { replace })
      }
      try {
        const targetPath = target.slice(prefix.length).split('?', 1)[0]
        if (targetPath === 'chat' || targetPath.startsWith('chats/')) {
          const { tab, href } = currentPage()
          const shouldOpenChat =
            targetPath === 'chat'
              ? true
              : await selectLinkedChat(
                  decodeURIComponent(targetPath.slice('chats/'.length)),
                  tab,
                  controller.signal
                )
          commit(resolveUrl(href, { workspaceId, base }))
          if (shouldOpenChat) latest.current.onOpenChat()
          return
        }

        if (!isWorkspaceTabId(targetPath))
          throw new Error('This destination is unavailable in this workspace')
        const queryKey = workspaceKeys.views(workspaceId)
        let availableViews = queryClient.getQueryData<ViewInfo[]>(queryKey) ?? latest.current.views
        if (!tabAvailable(targetPath, availableViews)) {
          await queryClient.refetchQueries({ queryKey, exact: true }, { throwOnError: true })
          availableViews = queryClient.getQueryData<ViewInfo[]>(queryKey) ?? latest.current.views
        }
        if (!tabAvailable(targetPath, availableViews))
          throw new Error('This destination is unavailable in this workspace')
        commit(target)
      } finally {
        if (navigationRequest.current?.controller === controller) navigationRequest.current = null
      }
    },
    [base, currentPage, latest, prefix, queryClient, selectLinkedChat, setLocation, workspaceId]
  )

  useEffect(() => {
    const request = navigationRequest.current
    if (request && request.address !== browserAddress()) request.controller.abort()
  }, [path, search, workspaceId])
  useEffect(() => () => navigationRequest.current?.controller.abort(), [])

  const reportError = useCallback(
    (error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'Navigation failed'
      toast.add({ type: 'error', title: 'Could not navigate', description: message })
      reportAppletError(workspaceId, { source: 'runtime', message })
    },
    [workspaceId]
  )

  const navigateToTab = useCallback(
    (tab: WorkspaceTabId, options: NavigationOptions = {}) => {
      void navigate(tabUrl(remembered, tab), options).catch(reportError)
    },
    [navigate, remembered, reportError]
  )

  useAppletEvent(workspaceId, 'navigate', href => {
    void navigate(href).catch(reportError)
  })
  useNavigationClient(workspaceId, navigate)

  useEffect(() => {
    if (path && !isChatLink) return
    let href = tabUrl(remembered, activeTab)
    if (isChatLink) {
      try {
        href = resolveUrl(`moi:/${path}`)
      } catch {
        // Invalid chat links restore the saved tab without selecting a chat.
      }
    }
    const controller = new AbortController()
    void navigate(href, { replace: true }, controller).catch(error => {
      if (!controller.signal.aborted) reportError(error)
    })
    return () => controller.abort()
  }, [activeTab, isChatLink, navigate, path, remembered, reportError, search])

  useEffect(() => {
    if (!isAvailableTab) return
    remembered.set(activeTab, `moi:/${activeTab}${search}`)
    const current = latest.current.tabsState
    const open = current.open.includes(activeTab) ? current.open : [...current.open, activeTab]
    if (open !== current.open || current.active !== activeTab) setTabs({ open, active: activeTab })
  }, [activeTab, isAvailableTab, latest, remembered, search, setTabs])

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
      if (url.origin !== window.location.origin || !url.pathname.startsWith(prefix)) return
      // In-page fragments continue using native browser behavior.
      if (url.hash) return
      event.preventDefault()
      void navigate(`moi:/${url.pathname.slice(prefix.length)}${url.search}`).catch(reportError)
    },
    [navigate, prefix, reportError]
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
