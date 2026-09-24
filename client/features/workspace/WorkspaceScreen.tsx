import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { AnimatePresence } from 'motion/react'

import {
  IconBrowserPlus,
  IconLayout2,
  IconLayoutSidebarRight,
  IconMessages,
  IconSketching
} from '@tabler/icons-react'

import { DrawingLayer } from '@/client/features/drawings/DrawingLayer'
import { DrawingToolbar } from '@/client/features/drawings/DrawingToolbar'
import { useChatAnnotation } from '@/client/features/drawings/useChatAnnotation'
import { ChatPanel } from '@/client/features/chat/ChatPanel'
import type { WelcomeDestination } from '@/client/features/chat/messages/ChatEmptyState'
import { ChatPopup } from '@/client/features/chat/ChatPopup'
import { ThemePanel } from '@/client/features/workspace/ThemePanel'
import { Overview } from '@/client/features/overview/Overview'
import { PanelHeader } from '@/client/components/shared/PanelHeader'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { toast } from '@/client/components/ui/toast'
import {
  useAppletChatMessage,
  useAppletChatAttachment
} from '@/client/features/chat/applet-chat-intents'
import { useChat } from '@/client/features/chat/useChat'
import { usePinnedSession } from '@/client/features/chat/sessions/useSelectedSession'
import {
  PendingViewScreen,
  type PendingViewHandle
} from '@/client/features/views/PendingViewScreen'
import { ViewManager } from '@/client/features/views/ViewManager'
import { getViewIcon, getViewLabel } from '@/client/features/views/view-presentation'
import { useViewActions } from '@/client/features/views/useViewActions'
import { useViewDrafts } from '@/client/features/views/useViewDrafts'
import { useFitsSplitLayout } from '@/client/features/workspace/useFitsSplitLayout'
import { useWorkspaceComposerState } from '@/client/features/chat/composer/useWorkspaceComposerState'
import { useWorkspaceTheme } from '@/client/runtime/workspace-theme'
import { resolveWorkspaceTheme } from '@/lib/themes'
import {
  hasRunningWorkspaceActivity,
  isSessionRunning,
  useLive
} from '@/client/features/chat/chat-store'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { WorkspaceMenu } from '@/client/features/workspace/WorkspaceMenu'
import {
  effectiveOpenTabs,
  normalizeTabsState,
  tabAvailable
} from '@/client/features/workspace/tab-resolution'
import { useWorkspaceNavigation } from '@/client/features/workspace/useWorkspaceNavigation'
import { cn } from '@/client/lib/cn'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import { useUiStore } from '@/client/store/ui'
import {
  type CreateWorkspaceTabItem,
  type WorkspaceTabItem,
  WorkspaceTabs
} from '@/client/features/workspace/WorkspaceTabs'
import { isDefaultWidget } from '@/lib/default-widgets'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import type {
  CompiledView,
  LayoutMode,
  PendingView,
  ViewInfo,
  WidgetInfo,
  WorkspaceTabId
} from '@/lib/types'
import { viewIdFromTab, viewTabId } from '@/lib/workspace-tabs'

import { WorkspaceSplitLayout } from './WorkspaceSplitLayout'
import { UnavailablePage } from './UnavailablePage'

const Scratchpad = lazy(() =>
  import('@/client/features/scratchpad/Scratchpad').then(module => ({
    default: module.Scratchpad
  }))
)

type WorkspaceScreenProps = {
  widgets: WidgetInfo[]
  views: ViewInfo[]
}

type WidgetMode = 'idle' | 'customizing' | 'theming'

function tabItemFor(
  tab: WorkspaceTabId,
  views: ViewInfo[],
  closable: boolean,
  agentRunning: boolean,
  viewRunning: (sessionId: string) => boolean
): WorkspaceTabItem | null {
  if (tab === 'agent') {
    return {
      key: tab,
      Icon: IconMessages,
      label: 'Agent',
      closable,
      loading: agentRunning
    }
  }
  if (tab === 'overview') {
    return {
      key: tab,
      Icon: IconLayout2,
      label: 'Overview',
      closable: false,
      reorderable: false
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
  const viewId = viewIdFromTab(tab)
  const view = viewId ? views.find(v => v.id === viewId) : null
  return view
    ? {
        key: tab,
        Icon: getViewIcon(view),
        label: getViewLabel(view),
        closable: closable || view.status !== 'compiled',
        loading:
          view.status !== 'compiled' &&
          !!view.executionSessionId &&
          viewRunning(view.executionSessionId)
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

export function WorkspaceScreen({ widgets, views: allViews }: WorkspaceScreenProps) {
  const { layout, setLayout, workspaceId } = useWorkspaceLayoutCtx()
  const theme = resolveWorkspaceTheme(layout.theme)
  const viewActions = useViewActions()
  const {
    ref: rowRef,
    fits: canUseSplit,
    constraints: splitLayoutConstraints
  } = useFitsSplitLayout<HTMLDivElement>()
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('idle')
  const [floatingChatOpen, setFloatingChatOpen] = useState(false)
  const [chatFocusRequest, setChatFocusRequest] = useState(0)
  const pendingViewRefs = useRef(new Map<string, PendingViewHandle>())
  const dockedChatWidth = useUiStore(state => state.dockedChatWidth)
  const setDockedChatWidth = useUiStore(state => state.setDockedChatWidth)
  const sessionActivity = useLive(state => state.activity)
  const views = allViews.filter((view): view is CompiledView => view.status === 'compiled')
  const pendingViews = allViews.filter((view): view is PendingView => view.status !== 'compiled')
  const hasRunningSession = hasRunningWorkspaceActivity(sessionActivity, workspaceId)
  const viewDrafts = useViewDrafts({
    workspaceId,
    pendingViews,
    onSave: (viewId, requirements) => viewActions.save(viewId, requirements)
  })

  useWorkspaceTheme(layout.theme)

  // Split needs the open set to decide whether it's available at all, and the
  // navigation hook needs split to resolve the active tab — so the open set is
  // derived from the raw layout here, before either.
  const openTabIds = effectiveOpenTabs(normalizeTabsState(layout.tabs), allViews)
  const nonAgentOpenTabs = openTabIds.filter(tab => tab !== 'agent')
  const hasWorkspaceContent = nonAgentOpenTabs.length > 0
  const hasAppletWidgets = widgets.some(widget => !isDefaultWidget(widget.id))
  const hasWorkspaceApplets = hasAppletWidgets || views.length > 0

  // Effective layout mode. Split is only visible with workspace content and
  // enough row width; the saved mode remains the user's intent.
  const wantsSplit = layout.layoutMode === 'split' && hasWorkspaceContent
  const mode: LayoutMode = wantsSplit && canUseSplit ? 'split' : 'fullscreen'
  const dockedSplit = mode === 'split'

  // The tab address: URL in, active tab + applet params out, plus the persisted
  // tab state it keeps in sync. See useWorkspaceNavigation for the invariants.
  const {
    tabsState,
    activeTab,
    appletParams,
    navigateToTab,
    setTabs,
    isUnavailable,
    onNavigationClick
  } = useWorkspaceNavigation({
    views: allViews,
    split: dockedSplit
  })

  // Chat comes after navigation, and takes the address: every message carries
  // where the user is (active tab, and the params the view is rendering with)
  // in its `<moi-context>` envelope.
  const {
    view,
    forkedFromSessionId,
    chatLoaded,
    previewTurn,
    sessionId,
    composerSessionId,
    processing,
    error,
    loadError,
    retryLoad,
    send,
    stop,
    selectSession,
    dismissError
  } = useChat({ activeTab, appletParams })
  const { pinnedSessionId } = usePinnedSession()
  const { composerBanner, viewDraftComposerBanner, agentAvailability } = useWorkspaceComposerState(
    workspaceId,
    {
      chatError: error,
      onDismissChatError: dismissError,
      chatLoadError: loadError,
      onRetryChatLoad: retryLoad
    }
  )

  const openSet = new Set(tabsState.open)

  // Entering split with the agent tab on screen needs no special-casing
  // anymore: the URL resolution below derives a visible tab and the redirect
  // effect makes the URL follow it (replace).
  const setMode = (m: LayoutMode) => {
    setLayout({ layoutMode: m })
  }

  const visibleTabIds = dockedSplit ? nonAgentOpenTabs : openTabIds
  const canCloseTabs = openTabIds.length > 1
  const tabItems = visibleTabIds
    .map(tab =>
      tabItemFor(tab, allViews, canCloseTabs, hasRunningSession, sessionId =>
        isSessionRunning(sessionActivity, workspaceId, sessionId)
      )
    )
    .filter((tab): tab is WorkspaceTabItem => Boolean(tab))
  const activeViewId = viewIdFromTab(activeTab)
  const activeView = activeViewId ? views.find(v => v.id === activeViewId) : undefined
  const activePendingView = activeViewId
    ? pendingViews.find(pendingView => pendingView.id === activeViewId)
    : undefined
  const activeDraftView =
    !pinnedSessionId &&
    sessionId === null &&
    activePendingView?.status === 'draft' &&
    (!activePendingView.executionSessionId ||
      !isSessionRunning(sessionActivity, workspaceId, activePendingView.executionSessionId))
      ? activePendingView
      : undefined
  const activeDraftViewId = activeDraftView?.id
  const startupPending = !pinnedSessionId && activePendingView?.status === 'starting'
  const visibleChatLoaded = chatLoaded && !startupPending
  const canAnnotate =
    widgetMode === 'idle' &&
    ((activeTab === 'overview' && hasAppletWidgets) || activeView !== undefined)
  const {
    controls: annotationControls,
    docked: dockedAnnotation,
    layerProps: annotationLayerProps,
    popup: popupAnnotation,
    targetRef: annotationTargetRef
  } = useChatAnnotation({
    workspaceId,
    sessionId: composerSessionId,
    activeTab,
    mode,
    available: canAnnotate,
    closePopup: () => setFloatingChatOpen(false),
    openPopup: () => setFloatingChatOpen(true)
  })

  useEffect(() => {
    const open = tabsState.open.filter(tab => tabAvailable(tab, allViews))
    if (open.length === tabsState.open.length) return
    const nextOpen = effectiveOpenTabs(tabsState, allViews)
    setLayout({
      tabs: {
        open: nextOpen,
        active: nextOpen.includes(tabsState.active) ? tabsState.active : nextOpen[0]
      }
    })
  }, [allViews, setLayout, tabsState])

  useEffect(() => {
    if (mode !== 'fullscreen' || activeTab === 'agent') {
      setFloatingChatOpen(false)
    }
  }, [activeTab, mode])

  useEffect(() => {
    if (!activeDraftViewId) return
    if (mode === 'fullscreen') setFloatingChatOpen(true)
    setChatFocusRequest(request => request + 1)
  }, [activeDraftViewId, mode])

  // Tab switching is navigation; the saved default and the open set follow via
  // the navigation hook. Only the chat side effects belong to the screen.
  const openTab = (tab: WorkspaceTabId) => {
    navigateToTab(tab)
    if (tab === 'agent') {
      setFloatingChatOpen(false)
      setChatFocusRequest(request => request + 1)
    }
  }

  const createView = () => {
    // A pending view has no chat until its first submission.
    void viewActions.create().then(pendingView => openTab(viewTabId(pendingView.id)))
  }

  const navigateFromWelcome = (destination: WelcomeDestination) => {
    if (destination === 'views') {
      const firstView = views[0]
      if (firstView) openTab(viewTabId(firstView.id))
      else createView()
    } else {
      openTab(destination)
    }
    setFloatingChatOpen(false)
  }

  useWorkspaceEvent(event => {
    if (
      event.type === 'view:deleted' &&
      event.workspaceId === workspaceId &&
      activeTab === viewTabId(event.name)
    ) {
      openTab('overview')
    }
  })

  const deletePendingView = async (pendingView: PendingView) => {
    const sketch = pendingViewRefs.current.get(pendingView.id)
    try {
      await viewActions.discard(pendingView.id)
    } catch (error) {
      toast.add({
        title: error instanceof Error ? error.message : 'Couldn’t discard view',
        type: 'error'
      })
      return false
    }
    await sketch?.resetSketch()
    viewDrafts.clear(pendingView.id)
    return true
  }

  const closeTab = (tab: WorkspaceTabId) => {
    if (tab === 'overview') return
    const viewId = viewIdFromTab(tab)
    const pendingView = viewId ? pendingViews.find(candidate => candidate.id === viewId) : undefined
    if ((!canCloseTabs && !pendingView) || !openSet.has(tab)) return
    let open = tabsState.open.filter(t => t !== tab)
    if (open.length === 0) open = ['overview']
    // The neighbor that takes over when the tab on screen closes.
    const visibleIndex = visibleTabIds.indexOf(tab)
    const nextTab =
      visibleTabIds[visibleIndex + 1] ??
      visibleTabIds[visibleIndex - 1] ??
      open.find(t => tabAvailable(t, allViews)) ??
      'overview'
    const active =
      tabsState.active === tab || !open.includes(tabsState.active) ? nextTab : tabsState.active
    // Persist the open set BEFORE navigating so the sync effect (which reads
    // tabsStateRef) can't resurrect the closed tab.
    setTabs({ open, active })
    if (activeTab === tab) navigateToTab(nextTab)
    if (pendingView?.status === 'draft') void deletePendingView(pendingView)
  }

  const discardPendingView = async (pendingView: PendingView) => {
    if (!(await deletePendingView(pendingView))) return

    const tab = viewTabId(pendingView.id)
    if (!openSet.has(tab)) return
    let open = tabsState.open.filter(item => item !== tab)
    if (open.length === 0) open = ['overview']
    const nextTab = open.find(item => tabAvailable(item, allViews)) ?? 'overview'
    const active = tabsState.active === tab ? nextTab : tabsState.active
    setTabs({ open, active })
    if (activeTab === tab) navigateToTab(nextTab, { replace: true })
  }

  const reorderTabs = (orderedVisibleTabs: WorkspaceTabId[]) => {
    const open = applyVisibleTabOrder(tabsState.open, visibleTabIds, orderedVisibleTabs)
    if (open === tabsState.open) return
    setTabs({ open, active: tabsState.active })
  }

  const openChat = (intent?: string) => {
    if (intent !== undefined) {
      useUiStore
        .getState()
        .setComposerDraft(composerDraftKey(workspaceId, composerSessionId), intent)
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

  // Chat messages fired from applet UI. `openChat` is the reveal: on a view tab
  // in full-screen mode the chat is a closed popover, and a run the user can't
  // see is worse than a panel that opens itself.
  useAppletChatMessage({ sessionId, send, revealChat: openChat, agentAvailability })
  useAppletChatAttachment(composerSessionId, openChat)

  const createItems: CreateWorkspaceTabItem[] = [
    ...(!dockedSplit && !openSet.has('agent')
      ? ([
          {
            key: 'agent',
            Icon: IconMessages,
            label: 'Agent',
            onClick: () => openTab('agent')
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
    ...allViews
      .map(view => ({ view, tab: viewTabId(view.id) }))
      .filter(({ tab }) => !openSet.has(tab))
      .map(
        ({ view, tab }): CreateWorkspaceTabItem => ({
          key: tab,
          Icon: getViewIcon(view),
          label: getViewLabel(view),
          onClick: () => openTab(tab)
        })
      ),
    {
      key: 'create-view',
      Icon: IconBrowserPlus,
      label: 'New view',
      onClick: createView
    }
  ]

  const removeViewDrawing = useCallback(() => {
    if (activeDraftView) {
      void pendingViewRefs.current.get(activeDraftView.id)?.resetSketch()
    }
  }, [activeDraftView])
  const sendChat = async (text: string, options?: Parameters<typeof send>[1]) => {
    if (activePendingView?.status === 'draft') {
      await pendingViewRefs.current.get(activePendingView.id)?.prepareSketchForSend()
      await viewActions.submit(activePendingView, text)
      // Submit clears the sent attachment. Keep the canvas until the built view replaces it.
      viewDrafts.clear(activePendingView.id)
    } else await send(text, options)
  }

  const viewChatDraft = activeDraftView
    ? {
        sessionId: draftSessionId(viewTabId(activeDraftView.id)),
        onRemoveDrawing: removeViewDrawing
      }
    : undefined

  // The docked split chat. Full-screen Agent uses the tabbed chat below.
  const dockedChat = (
    <ChatPanel
      agent={theme.agent}
      active={mode === 'split'}
      focusRequest={chatFocusRequest}
      chatLoaded={visibleChatLoaded}
      hasWorkspaceApplets={hasWorkspaceApplets}
      view={view}
      forkedFromSessionId={forkedFromSessionId}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      composerBanner={activeDraftView ? viewDraftComposerBanner : composerBanner}
      agentAvailability={agentAvailability}
      send={sendChat}
      stop={stop}
      onNavigateFromWelcome={navigateFromWelcome}
      onClose={() => setMode('fullscreen')}
      annotation={dockedAnnotation}
      viewDraft={viewChatDraft}
      docked
    />
  )

  const tabbedChat = (
    <ChatPanel
      agent={theme.agent}
      active={mode === 'fullscreen' && activeTab === 'agent'}
      focusRequest={chatFocusRequest}
      chatLoaded={chatLoaded}
      hasWorkspaceApplets={hasWorkspaceApplets}
      view={view}
      forkedFromSessionId={forkedFromSessionId}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      composerBanner={composerBanner}
      agentAvailability={agentAvailability}
      send={sendChat}
      stop={stop}
      onNavigateFromWelcome={navigateFromWelcome}
    />
  )
  const workspacePanel = (
    <div
      className={cn(
        '@container/workspace relative flex h-full min-h-0 min-w-0 flex-1 flex-col-reverse overflow-hidden bg-background shadow-md transition-[border-radius,background-color] duration-100 ease-out motion-reduce:transition-none',
        mode === 'split' && 'rounded-xl'
      )}
    >
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={annotationTargetRef}
          inert={annotationControls.active || undefined}
          aria-hidden={annotationControls.active || undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background transition-colors duration-100 ease-out motion-reduce:transition-none"
        >
          {isUnavailable ? (
            <UnavailablePage onOpenOverview={() => openTab('overview')} />
          ) : activeTab === 'agent' ? (
            tabbedChat
          ) : activeTab === 'overview' ? (
            <Overview
              customizing={widgetMode === 'customizing'}
              theming={widgetMode === 'theming'}
              onThemingChange={theming => setWidgetMode(theming ? 'theming' : 'idle')}
              onCustomizingChange={customizing =>
                setWidgetMode(customizing ? 'customizing' : 'idle')
              }
              widgets={widgets}
              views={views}
              onOpenView={viewId => openTab(viewTabId(viewId))}
              onCreateView={createView}
              onCreateWidget={() => {
                selectSession(null)
                openChat('Create widget')
              }}
            />
          ) : activeTab === 'scratchpad' ? (
            <Suspense fallback={null}>
              <Scratchpad />
            </Suspense>
          ) : null}

          {pendingViews.map(pendingView => (
            <PendingViewScreen
              key={pendingView.id}
              ref={handle => {
                if (handle) pendingViewRefs.current.set(pendingView.id, handle)
                else pendingViewRefs.current.delete(pendingView.id)
              }}
              active={!isUnavailable && activePendingView?.id === pendingView.id}
              pendingView={pendingView}
              running={
                !!pendingView.executionSessionId &&
                isSessionRunning(sessionActivity, workspaceId, pendingView.executionSessionId)
              }
              sketchSessionId={
                pendingView.status === 'draft'
                  ? (pinnedSessionId ?? draftSessionId(viewTabId(pendingView.id)))
                  : undefined
              }
              chatDocked={mode === 'split'}
              workspaceId={workspaceId}
              onEditingStart={() => {
                if (mode === 'fullscreen') setFloatingChatOpen(false)
              }}
              onContinueInChat={openChat}
              onOpenChat={openChat}
              onDiscard={() => discardPendingView(pendingView)}
            />
          ))}

          {/* Views are not part of the chain above: ViewManager keeps them
                mounted across tab switches (and collapses to nothing while
                another tab is on screen), which is what makes a switch back
                instant. */}
          <ViewManager
            views={views}
            activeViewId={isUnavailable ? null : (activeView?.id ?? null)}
            params={appletParams}
          />
        </div>

        <DrawingLayer {...annotationLayerProps}>
          <DrawingToolbar
            controls={annotationControls}
            title="Draw annotation"
            busy={annotationControls.finishing}
            onComplete={() => void annotationControls.finish()}
          />
        </DrawingLayer>
      </div>

      <AnimatePresence>
        {widgetMode === 'theming' && <ThemePanel onClose={() => setWidgetMode('idle')} />}
      </AnimatePresence>

      <PanelHeader>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <WorkspaceMenu onOpenTheme={() => setWidgetMode('theming')} />
          <WorkspaceTabs
            tabs={tabItems}
            active={activeTab}
            createItems={createItems}
            onSelect={openTab}
            onClose={closeTab}
            onReorder={reorderTabs}
          />
        </div>
        {hasWorkspaceContent && canUseSplit && mode === 'fullscreen' && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setMode('split')}
                  aria-label="Dock chat"
                  className="text-muted-foreground"
                >
                  <IconLayoutSidebarRight stroke={1.75} />
                </Button>
              }
            />
            <TooltipContent>Dock chat</TooltipContent>
          </Tooltip>
        )}
      </PanelHeader>
    </div>
  )

  return (
    <div
      onClick={onNavigationClick}
      className="relative flex h-full min-h-0 flex-col font-sans text-foreground"
    >
      <div ref={rowRef} className="flex min-h-0 flex-1">
        {hasWorkspaceContent && canUseSplit && splitLayoutConstraints ? (
          <WorkspaceSplitLayout
            {...splitLayoutConstraints}
            workspace={workspacePanel}
            chat={dockedChat}
            open={mode === 'split'}
            chatWidth={dockedChatWidth}
            onCollapse={() => setMode('fullscreen')}
            onChatWidthChange={setDockedChatWidth}
          />
        ) : (
          workspacePanel
        )}
      </div>

      {mode === 'fullscreen' && activeTab !== 'agent' && hasWorkspaceContent && (
        <ChatPopup
          agent={theme.agent}
          loading={hasRunningSession}
          open={floatingChatOpen}
          onOpenChange={setFloatingChatOpen}
          onOpenChangeComplete={open => {
            if (open) {
              setChatFocusRequest(request => request + 1)
            }
          }}
        >
          {onClose => (
            <ChatPanel
              agent={theme.agent}
              active={floatingChatOpen}
              focusRequest={chatFocusRequest}
              chatLoaded={visibleChatLoaded}
              hasWorkspaceApplets={hasWorkspaceApplets}
              view={view}
              forkedFromSessionId={forkedFromSessionId}
              previewTurn={previewTurn}
              sessionId={sessionId}
              processing={processing}
              composerBanner={activeDraftView ? viewDraftComposerBanner : composerBanner}
              agentAvailability={agentAvailability}
              send={sendChat}
              stop={stop}
              onNavigateFromWelcome={navigateFromWelcome}
              onClose={onClose}
              annotation={popupAnnotation}
              viewDraft={viewChatDraft}
            />
          )}
        </ChatPopup>
      )}
    </div>
  )
}
