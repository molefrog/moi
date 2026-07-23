import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { useLocation } from 'wouter'
import { useHistoryState } from 'wouter/use-browser-location'

import {
  IconArticle,
  IconBrowserPlus,
  IconGhost,
  IconLayout2,
  IconLayoutSidebarRight,
  IconPalette,
  IconSketching
} from '@tabler/icons-react'
import { ChatPanel } from '@/client/features/chat/ChatPanel'
import { ChatPopup } from '@/client/features/chat/ChatPopup'
import { CustomizePanel } from '@/client/features/workspace/CustomizePanel'
import { AppletMount } from '@/client/features/applets/AppletMount'
import { useMoiAppletBridge } from '@/client/features/applets/applet-bridge'
import { WidgetErrorBoundary } from '@/client/features/applets/WidgetErrorBoundary'
import { Widgets } from '@/client/features/widgets/Widgets'
import { PanelHeader } from '@/client/components/shared/PanelHeader'
import { workspaceProviderIcon } from '@/client/features/home/workspace-presentation'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { WorkspaceSettings } from '@/client/features/settings/WorkspaceSettings'
import { useChat } from '@/client/features/chat/useChat'
import { useView } from '@/client/features/applets/useApplet'
import { ViewBuilderTab } from '@/client/features/views/ViewBuilderTab'
import { useViewBuilderActions } from '@/client/features/views/useViewBuilderActions'
import { useFitsSplitLayout } from '@/client/features/workspace/useFitsSplitLayout'
import { useWorkspaceAvailability } from '@/client/features/workspace/api'
import { useWorkspaceTheme } from '@/client/features/workspace/useWorkspaceTheme'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import {
  effectiveOpenTabs,
  normalizeTabsState,
  resolveActiveTab,
  tabAvailable
} from '@/client/features/workspace/tab-resolution'
import { resolveAppIcon } from '@/client/lib/app-icon-registry'
import { cn } from '@/client/lib/cn'
import { liveStore } from '@/client/features/chat/chat-store'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import {
  type CreateWorkspaceTabItem,
  type WorkspaceTabItem,
  WorkspaceTabs
} from '@/client/features/workspace/WorkspaceTabs'
import type {
  LayoutMode,
  ViewBuilder,
  ViewInfo,
  WidgetInfo,
  WorkspaceTabId,
  WorkspaceTabsState
} from '@/lib/types'
import {
  isParamsRecord,
  isWorkspaceTabId,
  parseWorkspaceTab,
  readAppletParams,
  viewBuilderIdFromTab,
  viewBuilderTabId,
  viewIdFromTab,
  viewTabId,
  workspaceTabPath
} from '@/lib/workspace-tabs'

const Scratchpad = lazy(() =>
  import('@/client/features/scratchpad/Scratchpad').then(module => ({
    default: module.Scratchpad
  }))
)

// Tab label for a view: its configured title, or the file-name id as fallback.
const viewLabel = (v: ViewInfo) => v.config.title || v.id

const viewBuilderIcon = (builder: ViewBuilder) => resolveAppIcon(builder.icon) ?? IconArticle

function viewIcon(view: ViewInfo, builders: ViewBuilder[]) {
  const builder = builders.find(candidate => candidate.viewId === view.id)
  return resolveAppIcon(view.config.icon) ?? resolveAppIcon(builder?.icon) ?? IconArticle
}

type SectionControlsProps = {
  mode: LayoutMode
  onToggleMode: () => void
}

// Temporary layout switch: fullscreen tabbed workspace ⇄ legacy split view.
function SectionControls({ mode, onToggleMode }: SectionControlsProps) {
  const fullscreen = mode === 'fullscreen'
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggleMode}
      aria-label={fullscreen ? 'Switch to split view' : 'Switch to full-screen view'}
    >
      <IconLayoutSidebarRight stroke={1.75} />
    </Button>
  )
}

type ViewAppProps = {
  view: ViewInfo
  // The view's addressable state, read from navigation state (focusTab /
  // `moi tab focus`). `{}` on a fresh mount, a new browser tab, or a plain
  // tab-bar click — the view must render sensibly with that.
  params: Record<string, unknown>
}

// A view — an agent-defined app — mounted full-area. The bundle owns its own
// layout + scroll, so we give it a plain filled box and fade it in (mirroring
// WidgetShell, but full-area instead of a grid cell).
function ViewApp({ view, params }: ViewAppProps) {
  const workspaceId = useWorkspaceId()
  const bundle = useView(view.id)

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {bundle.status === 'ready' && (
          <AppletMount
            asChild
            segment="views"
            name={view.id}
            version={bundle.version}
            key={bundle.version}
          >
            <motion.div
              className="absolute inset-0 overflow-auto"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <WidgetErrorBoundary
                name={view.id}
                kind="view"
                workspaceId={workspaceId}
                resetKey={bundle.version}
              >
                <bundle.Component params={params} />
              </WidgetErrorBoundary>
            </motion.div>
          </AppletMount>
        )}
        {bundle.status === 'error' && (
          <motion.p
            key={`err-${bundle.version}`}
            className="absolute inset-0 p-4 text-xs text-destructive"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {bundle.error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

type WorkspaceCustomizeActionProps = {
  active: boolean
  onToggle: () => void
}

function WorkspaceCustomizeAction({ active, onToggle }: WorkspaceCustomizeActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label="Customize"
            aria-pressed={active}
            onClick={onToggle}
          >
            <IconPalette stroke={1.75} />
          </Button>
        }
      />
      <TooltipContent>Customize</TooltipContent>
    </Tooltip>
  )
}

type WorkspaceScreenProps = {
  widgets: WidgetInfo[]
  views: ViewInfo[]
  builders: ViewBuilder[]
  // The URL's tab segment (raw wildcard — may be null or garbage). The active
  // tab derives from it; see tab-resolution.ts.
  urlTab: string | null
}

type WidgetMode = 'idle' | 'editing' | 'customizing'

function tabItemFor(
  tab: WorkspaceTabId,
  views: ViewInfo[],
  builders: ViewBuilder[],
  closable: boolean
): WorkspaceTabItem | null {
  if (tab === 'agent') {
    return {
      key: tab,
      Icon: IconGhost,
      label: 'Agent',
      closable
    }
  }
  if (tab === 'widgets') {
    return {
      key: tab,
      Icon: IconLayout2,
      label: 'Widgets',
      closable
    }
  }
  if (tab === 'scratchpad') {
    return {
      key: tab,
      Icon: IconSketching,
      label: 'Scratchpad',
      closable
    }
  }
  const builderId = viewBuilderIdFromTab(tab)
  const builder = builderId ? builders.find(candidate => candidate.id === builderId) : null
  if (builder) {
    return {
      key: tab,
      Icon: viewBuilderIcon(builder),
      label: builder.title || builder.viewId || 'New view',
      closable
    }
  }
  const viewId = viewIdFromTab(tab)
  const view = viewId ? views.find(v => v.id === viewId) : null
  return view
    ? {
        key: tab,
        Icon: viewIcon(view, builders),
        label: viewLabel(view),
        closable
      }
    : null
}

function applyVisibleTabOrder(
  open: WorkspaceTabId[],
  visible: WorkspaceTabId[],
  orderedVisible: WorkspaceTabId[]
) {
  const visibleSet = new Set(visible)
  let cursor = 0
  return open.map(tab => (visibleSet.has(tab) ? orderedVisible[cursor++] : tab))
}

export function WorkspaceScreen({ widgets, views, builders, urlTab }: WorkspaceScreenProps) {
  const {
    view,
    previewTurn,
    sessionId,
    processing,
    error,
    send,
    stop,
    switchThread,
    dismissError
  } = useChat()
  const { layout, setLayout, name, icon, provider, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  // Applet params ride wouter navigation state; anything malformed reads as {}.
  const historyState = useHistoryState<unknown>()
  const appletParams = useMemo(() => readAppletParams(historyState), [historyState])
  // Keep the composer read/write, but block sends when its agent executable is
  // missing. The Send button explains how to install it.
  const availability = useWorkspaceAvailability(workspaceId).data
  const unavailableReason =
    availability === undefined ? undefined : availability.available ? null : availability.reason
  const builderActions = useViewBuilderActions()
  const { ref: rowRef, fits: canUseSplit } = useFitsSplitLayout<HTMLDivElement>()
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('idle')
  const [floatingChatOpen, setFloatingChatOpen] = useState(false)
  const [chatFocusRequest, setChatFocusRequest] = useState(0)

  // Theme is scoped to this wrapper, not :root — the sidebar keeps the default
  // tokens. The floating chat portals into the same element so it inherits them.
  const themeRef = useRef<HTMLDivElement>(null)
  useWorkspaceTheme(layout.theme, themeRef)

  const tabsState = normalizeTabsState(layout.tabs)
  const tabsStateRef = useRef(tabsState)
  tabsStateRef.current = tabsState
  const openTabIds = effectiveOpenTabs(tabsState, views, builders)
  const openSet = new Set(tabsState.open)
  const nonAgentOpenTabs = openTabIds.filter(tab => tab !== 'agent')
  const hasWorkspaceContent = nonAgentOpenTabs.length > 0

  // Effective layout mode. Split is only visible with workspace content and
  // enough row width; the saved mode remains the user's intent.
  const wantsSplit = layout.layoutMode === 'split' && hasWorkspaceContent
  const mode: LayoutMode = wantsSplit && canUseSplit ? 'split' : 'fullscreen'
  const dockedSplit = mode === 'split'

  // Entering split with the agent tab on screen needs no special-casing
  // anymore: the URL resolution below derives a visible tab and the redirect
  // effect makes the URL follow it (replace).
  const setMode = (m: LayoutMode) => {
    setLayout({ layoutMode: m })
  }

  // The ACTIVE tab derives from the URL; `tabsState.active` is only the saved
  // default (where a bare /workspace/:id lands). A URL naming an available tab
  // wins; anything else falls back through the same availability chain as
  // before, and the redirect effect below rewrites the URL to match.
  const requestedTab = parseWorkspaceTab(urlTab)
  const activeTab = resolveActiveTab(requestedTab, tabsState, views, builders, dockedSplit)
  const urlTabHonored = requestedTab !== null && requestedTab === activeTab

  const visibleTabIds = dockedSplit ? nonAgentOpenTabs : openTabIds
  const canCloseTabs = openTabIds.length > 1
  const tabItems = visibleTabIds
    .map(tab =>
      tabItemFor(tab, views, builders, canCloseTabs || viewBuilderIdFromTab(tab) !== null)
    )
    .filter((tab): tab is WorkspaceTabItem => Boolean(tab))
  const activeViewId = viewIdFromTab(activeTab)
  const activeView = activeViewId ? views.find(v => v.id === activeViewId) : undefined
  const activeBuilderId = viewBuilderIdFromTab(activeTab)
  const activeBuilder = activeBuilderId
    ? builders.find(builder => builder.id === activeBuilderId)
    : undefined

  // Keep the URL honest — replace, never push, so Back leaves the workspace
  // instead of walking tab history. This is the single redirect: a bare
  // /workspace/:id, an unknown/unavailable tab, or the agent tab while split
  // mode hides it all land on the resolved tab.
  useEffect(() => {
    if (urlTab === activeTab) return
    navigate(workspaceTabPath(workspaceId, activeTab), { replace: true })
  }, [activeTab, navigate, urlTab, workspaceId])

  const setTabs = useCallback(
    (tabs: WorkspaceTabsState) => {
      tabsStateRef.current = tabs
      setLayout({ tabs })
    },
    [setLayout]
  )

  // Navigating IS the tab switch, so persist its effects through the same
  // write path as before: the saved default (`tabs.active`) follows the URL,
  // and a URL-navigated tab missing from the open set is auto-added, like
  // openTab used to do. Only an honored URL tab writes — redirects settle
  // into an honored URL first.
  useEffect(() => {
    if (!urlTabHonored) return
    const current = tabsStateRef.current
    const open = current.open.includes(activeTab) ? current.open : [...current.open, activeTab]
    if (open === current.open && current.active === activeTab) return
    setTabs({ open, active: activeTab })
  }, [activeTab, setTabs, urlTabHonored])

  useEffect(() => {
    const open = tabsState.open.filter(tab => tabAvailable(tab, views, builders))
    if (open.length === tabsState.open.length) return
    const nextOpen = effectiveOpenTabs(tabsState, views, builders)
    setLayout({
      tabs: {
        open: nextOpen,
        active: nextOpen.includes(tabsState.active) ? tabsState.active : nextOpen[0]
      }
    })
  }, [builders, setLayout, tabsState, views])

  useEffect(() => {
    const replacements = new Map<WorkspaceTabId, WorkspaceTabId>()
    for (const builder of builders) {
      if (builder.status !== 'ready' || !builder.viewId) continue
      if (!views.some(view => view.id === builder.viewId)) continue
      replacements.set(viewBuilderTabId(builder.id), viewTabId(builder.viewId))
    }
    if (replacements.size === 0) return

    // The URL follows a replaced builder tab to the view that took its place.
    const urlReplacement = replacements.get(activeTab)
    if (urlReplacement) {
      navigate(workspaceTabPath(workspaceId, urlReplacement), { replace: true })
    }

    const replacementViews = new Set(replacements.values())
    const sourceForView = new Map(
      [...replacements].map(([builderTab, viewTab]) => [viewTab, builderTab])
    )
    const open: WorkspaceTabId[] = []
    let changed = false
    for (const tab of tabsState.open) {
      const source = sourceForView.get(tab)
      if (replacementViews.has(tab) && source && tabsState.open.includes(source)) {
        changed = true
        continue
      }
      const replacement = replacements.get(tab)
      const next = replacement ?? tab
      if (replacement) changed = true
      if (!open.includes(next)) open.push(next)
    }
    if (!changed) return
    const active = replacements.get(tabsState.active) ?? tabsState.active
    setLayout({ tabs: { open: open.length > 0 ? open : ['agent'], active } })
  }, [activeTab, builders, navigate, setLayout, tabsState, views, workspaceId])

  useEffect(() => {
    const linked = activeBuilder ?? builders.find(builder => builder.viewId === activeViewId)
    if (linked) liveStore.getState().setActive(workspaceId, linked.sessionId)
  }, [activeBuilder, activeViewId, builders, workspaceId])

  useEffect(() => {
    if (mode !== 'fullscreen' || activeTab === 'agent') {
      setFloatingChatOpen(false)
    }
  }, [activeTab, mode])

  // All tab switching goes through the router: a replace-navigation to the
  // tab's URL. The saved default and the open set follow via the sync effect
  // above (same layout write path as before).
  const openTab = (tab: WorkspaceTabId, params?: Record<string, unknown>) => {
    navigate(workspaceTabPath(workspaceId, tab), {
      replace: true,
      // Only a focus navigation carries state; a plain tab click resets it,
      // so the target view mounts with empty params. That's by design.
      ...(params ? { state: { appletParams: params } } : {})
    })
    if (tab === 'agent') {
      setFloatingChatOpen(false)
      setChatFocusRequest(request => request + 1)
    }
  }

  // Focus requests from outside the tab bar — the `window.moi` applet bridge
  // and `moi tab focus` events. The tab id crosses a trust boundary, so
  // validate the shape; a well-formed id for a missing view just resolves to
  // the default like any dead URL.
  const focusTab = (tab: WorkspaceTabId, params?: Record<string, unknown>) => {
    if (!isWorkspaceTabId(tab)) return
    openTab(tab, isParamsRecord(params) ? params : undefined)
  }

  useMoiAppletBridge({ focusTab })

  useWorkspaceEvent(event => {
    if (event.type === 'tab:focus' && event.workspaceId === workspaceId) {
      focusTab(event.tab, event.params)
    }
  })

  const closeTab = (tab: WorkspaceTabId) => {
    const builderId = viewBuilderIdFromTab(tab)
    const builder = builderId ? builders.find(candidate => candidate.id === builderId) : undefined
    if ((!canCloseTabs && !builder) || !openSet.has(tab)) return
    let open = tabsState.open.filter(t => t !== tab)
    if (open.length === 0) open = ['agent']
    // The neighbor that takes over when the tab on screen closes.
    const visibleIndex = visibleTabIds.indexOf(tab)
    const nextTab =
      visibleTabIds[visibleIndex + 1] ??
      visibleTabIds[visibleIndex - 1] ??
      open.find(t => tabAvailable(t, views, builders)) ??
      'agent'
    const active =
      tabsState.active === tab || !open.includes(tabsState.active) ? nextTab : tabsState.active
    // Persist the open set BEFORE navigating so the sync effect (which reads
    // tabsStateRef) can't resurrect the closed tab.
    setTabs({ open, active })
    if (activeTab === tab) navigate(workspaceTabPath(workspaceId, nextTab), { replace: true })
    if (builder?.status === 'draft') void builderActions.discard(builder.id)
  }

  const discardBuilder = (builder: ViewBuilder) => {
    const tab = viewBuilderTabId(builder.id)
    if (openSet.has(tab)) {
      let open = tabsState.open.filter(item => item !== tab)
      if (open.length === 0) open = ['agent']
      setTabs({ open, active: tabsState.active === tab ? open[0] : tabsState.active })
      if (activeTab === tab) navigate(workspaceTabPath(workspaceId, open[0]), { replace: true })
    }
    void builderActions.discard(builder.id)
  }

  const reorderTabs = (orderedVisibleTabs: WorkspaceTabId[]) => {
    const open = applyVisibleTabOrder(tabsState.open, visibleTabIds, orderedVisibleTabs)
    if (open === tabsState.open) return
    setTabs({ open, active: tabsState.active })
  }

  const openChat = (intent?: string) => {
    if (intent !== undefined) {
      liveStore.getState().setDraft(workspaceId, sessionId, intent)
    }
    if (mode === 'fullscreen' && activeTab !== 'agent') {
      setFloatingChatOpen(true)
      if (floatingChatOpen) {
        setChatFocusRequest(request => request + 1)
      }
      return
    }
    setChatFocusRequest(request => request + 1)
  }

  const createItems: CreateWorkspaceTabItem[] = [
    ...(!dockedSplit && !openSet.has('agent')
      ? ([
          {
            key: 'agent',
            Icon: IconGhost,
            label: 'Agent',
            onClick: () => openTab('agent')
          }
        ] satisfies CreateWorkspaceTabItem[])
      : []),
    ...(!openSet.has('widgets')
      ? ([
          {
            key: 'widgets',
            Icon: IconLayout2,
            label: 'Widgets',
            onClick: () => openTab('widgets')
          }
        ] satisfies CreateWorkspaceTabItem[])
      : []),
    ...(!openSet.has('scratchpad')
      ? ([
          {
            key: 'scratchpad',
            Icon: IconSketching,
            label: 'Scratchpad',
            onClick: () => openTab('scratchpad')
          }
        ] satisfies CreateWorkspaceTabItem[])
      : []),
    ...views
      .map(v => ({ view: v, tab: viewTabId(v.id) }))
      .filter(({ tab }) => !openSet.has(tab))
      .map(
        ({ view, tab }): CreateWorkspaceTabItem => ({
          key: tab,
          Icon: viewIcon(view, builders),
          label: viewLabel(view),
          onClick: () => openTab(tab)
        })
      ),
    ...builders
      .filter(builder => builder.status !== 'ready')
      .map(builder => ({ builder, tab: viewBuilderTabId(builder.id) }))
      .filter(({ tab }) => !openSet.has(tab))
      .map(
        ({ builder, tab }): CreateWorkspaceTabItem => ({
          key: tab,
          Icon: viewBuilderIcon(builder),
          label: builder.title || builder.viewId || 'New view',
          onClick: () => openTab(tab)
        })
      ),
    {
      key: 'create-view',
      Icon: IconBrowserPlus,
      label: 'New view',
      onClick: () => {
        void builderActions.create().then(builder => openTab(viewBuilderTabId(builder.id)))
      }
    }
  ]

  // The docked split chat. Full-screen Agent uses the tabbed chat below.
  const dockedChat = (
    <ChatPanel
      active={mode === 'split'}
      focusRequest={chatFocusRequest}
      view={view}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      error={error}
      onDismissError={dismissError}
      unavailableReason={unavailableReason}
      send={send}
      stop={stop}
      onSwitchThread={switchThread}
    />
  )

  const tabbedChat = (
    <ChatPanel
      active={mode === 'fullscreen' && activeTab === 'agent'}
      focusRequest={chatFocusRequest}
      view={view}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      error={error}
      onDismissError={dismissError}
      unavailableReason={unavailableReason}
      send={send}
      stop={stop}
      onSwitchThread={switchThread}
    />
  )

  return (
    // Themed wrapper: scoped CSS vars (bg/fg/font) live here so the panel — and
    // the portaled floating chat — pick up the workspace theme, while the
    // sidebar outside stays default.
    <div
      ref={themeRef}
      className="relative flex h-full min-h-0 flex-col bg-background font-sans text-foreground"
    >
      <div ref={rowRef} className="flex min-h-0 flex-1">
        {/* Full-screen: whole panel. Split: the left content column. */}
        {(mode === 'fullscreen' || hasWorkspaceContent) && (
          <div
            className={cn('flex min-h-0 flex-1 flex-col', mode === 'split' && 'min-w-(--column-w)')}
          >
            <PanelHeader>
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <div className="flex items-center gap-2">
                  <img
                    src={icon ?? workspaceProviderIcon[provider ?? 'claude-code']}
                    alt=""
                    className="size-5 shrink-0 rounded-[4px]"
                  />
                  {name && (
                    <span className="truncate text-sm font-medium text-foreground">{name}</span>
                  )}
                </div>
                <WorkspaceTabs
                  tabs={tabItems}
                  active={activeTab}
                  createItems={createItems}
                  onSelect={openTab}
                  onClose={closeTab}
                  onReorder={reorderTabs}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <WorkspaceCustomizeAction
                  active={widgetMode === 'customizing'}
                  onToggle={() =>
                    setWidgetMode(widgetMode === 'customizing' ? 'idle' : 'customizing')
                  }
                />
                <WorkspaceSettings />
                {hasWorkspaceContent && canUseSplit && (
                  <SectionControls
                    mode={mode}
                    onToggleMode={() => setMode(mode === 'fullscreen' ? 'split' : 'fullscreen')}
                  />
                )}
              </div>
            </PanelHeader>

            {activeTab === 'agent' ? (
              tabbedChat
            ) : activeTab === 'widgets' ? (
              <Widgets
                editing={widgetMode === 'editing'}
                onEditingChange={editing => setWidgetMode(editing ? 'editing' : 'idle')}
                widgets={widgets}
                onCreateWidget={() => openChat('Create widget')}
              />
            ) : activeTab === 'scratchpad' ? (
              <Suspense fallback={null}>
                <Scratchpad />
              </Suspense>
            ) : activeBuilder ? (
              <ViewBuilderTab
                key={activeBuilder.id}
                builder={activeBuilder}
                unavailableReason={unavailableReason}
                onSave={requirements => builderActions.save(activeBuilder.id, requirements)}
                onSubmit={requirements => {
                  if (mode === 'fullscreen') setFloatingChatOpen(true)
                  return builderActions.submit(activeBuilder, requirements)
                }}
                onOpenChat={() => {
                  liveStore.getState().setActive(workspaceId, activeBuilder.sessionId)
                  openChat()
                }}
                onDiscard={() => discardBuilder(activeBuilder)}
              />
            ) : activeView ? (
              <ViewApp view={activeView} params={appletParams} />
            ) : null}
          </div>
        )}

        {/* Split: Agent chat as a bounded right column. Full-screen mode uses the
            Agent tab instead. */}
        {mode === 'split' && (
          <div
            className={cn(
              'flex min-h-0 min-w-(--chat-min) flex-[0_1_var(--chat-max)] flex-col overflow-hidden border-l border-border'
            )}
          >
            {dockedChat}
          </div>
        )}
      </div>

      <AnimatePresence>{widgetMode === 'customizing' && <CustomizePanel />}</AnimatePresence>

      {mode === 'fullscreen' && activeTab !== 'agent' && hasWorkspaceContent && (
        <ChatPopup
          open={floatingChatOpen}
          onOpenChange={setFloatingChatOpen}
          onOpenChangeComplete={open => {
            if (open) {
              setChatFocusRequest(request => request + 1)
            }
          }}
          container={themeRef}
        >
          {onClose => (
            <ChatPanel
              active={floatingChatOpen}
              focusRequest={chatFocusRequest}
              view={view}
              previewTurn={previewTurn}
              sessionId={sessionId}
              processing={processing}
              error={error}
              onDismissError={dismissError}
              unavailableReason={unavailableReason}
              send={send}
              stop={stop}
              onSwitchThread={switchThread}
              onClose={onClose}
            />
          )}
        </ChatPopup>
      )}
    </div>
  )
}
