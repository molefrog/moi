import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useRouter } from 'wouter'
import { usePathname, useSearch } from 'wouter/use-browser-location'

import { toast } from '@/client/components/ui/toast'
import { workspaceKeys } from '@/client/api/workspace-keys'
import { reportAppletError } from '@/client/features/applets/applet-log'
import { useAppletEvent } from '@/client/features/applets/applet-runtime'
import { useCollabEnabled } from '@/client/features/collab'
import { useWorkspaceTabs } from '@/client/features/workspace/browser-tab-state'
import { normalizeTabsState, resolveActiveTab, tabAvailable } from './tab-resolution'
import { useWorkspaceLayoutCtx } from './WorkspaceLayoutContext'
import { useLatestRef } from '@/client/lib/use-latest-ref'
import { useNavigationClient } from '@/client/runtime/useWorkspaceEvents'
import {
  usePinnedSession,
  useSelectedSession,
  selectedSessionKey,
  selectedSessionOptions
} from '@/client/features/chat/sessions/useSelectedSession'
import { resolveChatLink } from '@/client/features/chat/sessions/chat-link'
import type { WorkspaceSessionSelection } from '@/lib/types'
import type { ViewInfo, WorkspaceTabId, WorkspaceTabsState } from '@/lib/types'
import {
  addressPath,
  canonicalSearch,
  chatSessionIdFromPath,
  legacyTabFromPath,
  parseMoiHref,
  readViewParams,
  resolveUrl,
  tabFromPath,
  workspacePath
} from '@/lib/navigation'
type NavigationOptions = { replace?: boolean }

// A convenience for returning to tabs, never a second source of active state.
// Memory-only, and scoped by workspace so switching workspaces cannot leak params.
const rememberedAddresses = new Map<string, Map<WorkspaceTabId, string>>()

type UseWorkspaceNavigationOptions = {
  views: ViewInfo[]
  onOpenChat: () => void
}

export function useWorkspaceNavigation({ views, onOpenChat }: UseWorkspaceNavigationOptions) {
  const queryClient = useQueryClient()
  const { layout, setLayout, workspaceId } = useWorkspaceLayoutCtx()
  const collabEnabled = useCollabEnabled()
  const [, , selectSessionForTab] = useSelectedSession()
  const { pinAsync } = usePinnedSession()
  const chatRequest = useRef<AbortController | null>(null)
  const workspaceIdRef = useLatestRef(workspaceId)
  const onOpenChatRef = useLatestRef(onOpenChat)
  const [, navigate] = useLocation()
  const router = useRouter()
  const { base } = router
  // wouter's public route/search hooks decode URI escapes already. Read raw
  // browser values so tabFromPath and URLSearchParams each decode only once.
  const path = usePathname(router).slice(workspacePath(workspaceId, base).length + 1)
  const search = canonicalSearch(useSearch(router))
  const appletParams = useMemo(() => readViewParams(search), [search])
  const [workspaceTabs, setLocalTabs] = useWorkspaceTabs(
    workspaceId,
    collabEnabled,
    normalizeTabsState(layout.tabs)
  )
  const tabsState = normalizeTabsState(workspaceTabs)
  const tabsStateRef = useLatestRef(tabsState)
  const remembered = useMemo(() => {
    let entries = rememberedAddresses.get(workspaceId)
    if (!entries) rememberedAddresses.set(workspaceId, (entries = new Map()))
    return entries
  }, [workspaceId])
  const requestedTab = tabFromPath(path)
  const isChatLink = path === 'chats' || path.startsWith('chats/')
  const linkedSessionId = chatSessionIdFromPath(path)
  const legacyTab = requestedTab ? null : legacyTabFromPath(path)
  const activeTab = resolveActiveTab(requestedTab ?? legacyTab, tabsState, views)
  const isUnavailable =
    Boolean(path) &&
    !isChatLink &&
    !legacyTab &&
    (!requestedTab || !tabAvailable(requestedTab, views))
  const honored = requestedTab === activeTab && !isUnavailable

  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      tabsStateRef.current = tabs
      if (collabEnabled) setLocalTabs(tabs)
      else setLayout({ tabs })
    },
    [setLayout, tabsStateRef, collabEnabled, setLocalTabs]
  )

  const go = useCallback(
    (target: string, options: NavigationOptions = {}) => {
      chatRequest.current?.abort()
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

  const openLinkedChat = useLatestRef(
    async (sessionId: string, controller = new AbortController()) => {
      chatRequest.current?.abort()
      chatRequest.current = controller
      const originalUrl = window.location.href
      const checkCurrent = () => {
        if (window.location.href !== originalUrl || workspaceIdRef.current !== workspaceId)
          controller.abort()
        controller.signal.throwIfAborted()
      }
      try {
        const tab = await resolveChatLink(
          queryClient,
          workspaceId,
          sessionId,
          views,
          controller.signal
        )
        checkCurrent()
        if (!tab) {
          go(addressPath(workspaceId, { tab: 'overview', search: '' }), { replace: true })
          return
        }
        // Direct loads can resolve the chat before selection and pin state load.
        await queryClient.ensureQueryData(selectedSessionOptions(workspaceId))
        if (collabEnabled)
          await queryClient.ensureQueryData(selectedSessionOptions(workspaceId, 'browser-tab'))
        checkCurrent()
        const pinned = queryClient.getQueryData<WorkspaceSessionSelection>(
          selectedSessionKey(workspaceId)
        )?.pinned
        if (pinned && pinned !== sessionId) {
          await pinAsync(null)
          checkCurrent()
        }
        if (pinned !== sessionId) {
          await selectSessionForTab(sessionId, tab)
          checkCurrent()
        }
        go(addressPath(workspaceId, { tab, search: '' }), { replace: true })
        onOpenChatRef.current()
      } finally {
        if (chatRequest.current === controller) chatRequest.current = null
      }
    }
  )

  useEffect(() => () => chatRequest.current?.abort(), [path, search, workspaceId])

  const navigateHref = useCallback(
    async (href: string, availableViews = views) => {
      if (href.startsWith('moi:/files/') || !href.startsWith('moi:')) {
        window.location.assign(
          resolveUrl(href, { apiBase: `/api/workspaces/${encodeURIComponent(workspaceId)}` })
        )
        return
      }
      const address = parseMoiHref(href)
      if ('sessionId' in address) {
        await openLinkedChat.current(address.sessionId)
        return
      }
      if (!tabAvailable(address.tab, availableViews))
        throw new Error('This destination is unavailable in this workspace')
      go(addressPath(workspaceId, address))
    },
    [go, openLinkedChat, views, workspaceId]
  )

  const reportError = useCallback(
    (error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'Navigation failed'
      toast.add({ type: 'error', title: 'Could not navigate', description: message })
      reportAppletError(workspaceId, { source: 'runtime', message })
    },
    [workspaceId]
  )

  useAppletEvent(workspaceId, 'navigate', href => {
    void navigateHref(href).catch(reportError)
  })
  useNavigationClient(workspaceId, async href => {
    const queryKey = workspaceKeys.views(workspaceId)
    if (href.startsWith('moi:/views/')) {
      const address = parseMoiHref(href)
      if ('tab' in address && !tabAvailable(address.tab, views))
        await queryClient.refetchQueries({ queryKey, exact: true }, { throwOnError: true })
    }
    await navigateHref(href, queryClient.getQueryData<ViewInfo[]>(queryKey) ?? views)
  })

  useEffect(() => {
    if (!isChatLink) return
    if (!linkedSessionId) {
      go(addressPath(workspaceId, { tab: 'overview', search: '' }), { replace: true })
      return
    }
    const controller = new AbortController()
    void openLinkedChat.current(linkedSessionId, controller).catch(error => {
      if (!controller.signal.aborted) reportError(error)
    })
    return () => controller.abort()
  }, [go, isChatLink, linkedSessionId, openLinkedChat, path, reportError, search, workspaceId])

  // Bare workspace URLs and old view bookmarks
  // redirect separately from exact chat links. Missing views show recovery.
  useEffect(() => {
    if (isUnavailable) return
    if (legacyTab) {
      go(addressPath(workspaceId, { tab: legacyTab, search }), { replace: true })
    } else if (!path) {
      navigateToTab(activeTab, { replace: true })
    }
  }, [activeTab, go, legacyTab, navigateToTab, path, search, isUnavailable, workspaceId])

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
      const sessionId = chatSessionIdFromPath(url.pathname.slice(prefix.length))
      if (!tab && !sessionId) return
      event.preventDefault()
      if (sessionId) {
        // Entering the route gives in-app links normal Back behavior; the
        // resolver then replaces this intermediate address with the home tab.
        go(url.pathname.slice(base.length) + url.search)
        return
      }
      try {
        if (!tabAvailable(tab!, views))
          throw new Error('This destination is unavailable in this workspace')
        go(addressPath(workspaceId, { tab: tab!, search: canonicalSearch(url.search) }))
      } catch (error) {
        reportError(error)
      }
    },
    [base, go, reportError, views, workspaceId]
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
