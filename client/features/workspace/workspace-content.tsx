import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { AnimatePresence } from 'motion/react'

import {
  IconBrowserPlus,
  IconLayout2,
  IconLayoutSidebarRight,
  IconSketching
} from '@tabler/icons-react'

import { DrawingLayer } from '@/client/features/drawings/drawing-layer'
import { DrawingToolbar } from '@/client/features/drawings/drawing-toolbar'
import { useChatAnnotation } from '@/client/features/drawings/use-chat-annotation'
import { ChatPanel } from '@/client/features/chat/chat-panel'
import type { WelcomeDestination } from '@/client/features/chat/messages/chat-empty-state'
import { ChatPopup } from '@/client/features/chat/chat-popup'
import { ThemePanel } from '@/client/features/workspace/theme-panel'
import { Overview } from '@/client/features/overview/overview'
import { WorkspaceUsersMenu } from '@/client/features/collab'
import { PanelHeader } from '@/client/components/shared/panel-header'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { toast } from '@/client/components/ui/toast'
import {
  useAppletChatMessage,
  useAppletChatAttachment
} from '@/client/features/chat/applet-chat-intents'
import { useChat } from '@/client/features/chat/use-chat'
import { usePinnedSession } from '@/client/features/chat/sessions/use-selected-session'
import {
  PendingViewScreen,
  type PendingViewHandle
} from '@/client/features/views/pending-view-screen'
import { ViewManager } from '@/client/features/views/view-manager'
import { getViewIcon, getViewLabel } from '@/client/features/views/view-presentation'
import { useViewActions } from '@/client/features/views/use-view-actions'
import { useViewDrafts } from '@/client/features/views/use-view-drafts'
import { useWorkspaceComposerState } from '@/client/features/chat/composer/use-workspace-composer-state'
import { resolveWorkspaceTheme } from '@/lib/themes'
import {
  hasRunningWorkspaceActivity,
  isSessionRunning,
  useLive
} from '@/client/features/chat/chat-store'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/workspace-layout-context'
import { WorkspaceMenu } from '@/client/features/workspace/workspace-menu'
import { effectiveOpenTabs, tabAvailable } from '@/client/features/workspace/tab-resolution'
import { useWorkspaceNavigation } from '@/client/features/workspace/use-workspace-navigation'
import { useWorkspaceEvent } from '@/client/runtime/use-workspace-events'
import { useUiStore } from '@/client/store/ui'
import {
  type CreateWorkspaceTabItem,
  type WorkspaceTabItem,
  WorkspaceTabs
} from '@/client/features/workspace/workspace-tabs'
import { isDefaultWidget } from '@/lib/default-widgets'
import { composerDraftKey, draftSessionId } from '@/lib/session-drafts'
import type { CompiledView, PendingView, ViewInfo, WidgetInfo, WorkspaceTabId } from '@/lib/types'
import { viewIdFromTab, viewTabId } from '@/lib/workspace-tabs'

import { WorkspaceFrame, WorkspacePane, useWorkspaceFrame } from './workspace-frame'
import { UnavailablePage } from './unavailable-page'

const Scratchpad = lazy(() =>
  import('@/client/features/scratchpad/scratchpad').then(module => ({
    default: module.Scratchpad
  }))
)

type WorkspaceContentProps = {
  widgets: WidgetInfo[]
  views: ViewInfo[]
}

type WidgetMode = 'idle' | 'customizing' | 'theming'

function tabItemFor(
  tab: WorkspaceTabId,
  views: ViewInfo[],
  closable: boolean,
  viewRunning: (sessionId: string) => boolean
): WorkspaceTabItem | null {
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
          view.status !== 'compiled' && !!view.buildSessionId && viewRunning(view.buildSessionId)
      }
    : null
}

export function WorkspaceContent({ widgets, views: allViews }: WorkspaceContentProps) {
  const { layout, workspaceId } = useWorkspaceLayoutCtx()
  const theme = resolveWorkspaceTheme(layout.theme)
  const viewActions = useViewActions()
  const frame = useWorkspaceFrame()
  const { mode, canUseSplit, setMode } = frame
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('idle')
  const [floatingChatOpen, setFloatingChatOpen] = useState(false)
  const [chatFocusRequest, setChatFocusRequest] = useState(0)
  const pendingViewRefs = useRef(new Map<string, PendingViewHandle>())
  const sessionActivity = useLive(state => state.activity)
  const views = allViews.filter((view): view is CompiledView => view.status === 'compiled')
  const pendingViews = allViews.filter((view): view is PendingView => view.status !== 'compiled')
  const hasRunningSession = hasRunningWorkspaceActivity(sessionActivity, workspaceId)
  const viewDrafts = useViewDrafts({
    workspaceId,
    pendingViews,
    onSave: (viewId, requirements) => viewActions.save(viewId, requirements)
  })

  const hasAppletWidgets = widgets.some(widget => !isDefaultWidget(widget.id))
  const hasWorkspaceApplets = hasAppletWidgets || views.length > 0

  const revealChat = useCallback(() => {
    setFloatingChatOpen(true)
    setChatFocusRequest(request => request + 1)
  }, [])

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
    onOpenChat: revealChat
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

  const openTabIds = effectiveOpenTabs(tabsState, allViews)
  const openSet = new Set(tabsState.open)

  const canCloseTabs = openTabIds.length > 1
  const tabItems = openTabIds
    .map(tab =>
      tabItemFor(tab, allViews, canCloseTabs, sessionId =>
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
    (!activePendingView.buildSessionId ||
      !isSessionRunning(sessionActivity, workspaceId, activePendingView.buildSessionId))
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
    setTabs({
      open: nextOpen,
      active: nextOpen.includes(tabsState.active) ? tabsState.active : nextOpen[0]
    })
  }, [allViews, setTabs, tabsState])

  useEffect(() => {
    if (mode !== 'fullscreen') {
      setFloatingChatOpen(false)
    }
  }, [mode])

  useEffect(() => {
    if (!activeDraftViewId) return
    if (mode === 'fullscreen') setFloatingChatOpen(true)
    setChatFocusRequest(request => request + 1)
  }, [activeDraftViewId, mode])

  const openTab = navigateToTab

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
    const visibleIndex = openTabIds.indexOf(tab)
    const nextTab =
      openTabIds[visibleIndex + 1] ??
      openTabIds[visibleIndex - 1] ??
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

  const reorderTabs = (open: WorkspaceTabId[]) => {
    setTabs({ open, active: tabsState.active })
  }

  const openChat = (intent?: string) => {
    if (intent !== undefined) {
      useUiStore
        .getState()
        .setComposerDraft(composerDraftKey(workspaceId, composerSessionId), intent)
    }
    if (mode === 'fullscreen') {
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

  const chatPanelProps = {
    agent: theme.agent,
    focusRequest: chatFocusRequest,
    chatLoaded: visibleChatLoaded,
    hasWorkspaceApplets,
    view,
    forkedFromSessionId,
    previewTurn,
    sessionId,
    processing,
    composerBanner: activeDraftView ? viewDraftComposerBanner : composerBanner,
    agentAvailability,
    send: sendChat,
    stop,
    onNavigateFromWelcome: navigateFromWelcome,
    viewDraft: viewChatDraft
  }

  const dockedChat = (
    <ChatPanel
      {...chatPanelProps}
      active={mode === 'split'}
      onClose={() => setMode('fullscreen')}
      annotation={dockedAnnotation}
      docked
    />
  )

  const workspacePanel = (
    <WorkspacePane mode={mode}>
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={annotationTargetRef}
          inert={annotationControls.active || undefined}
          aria-hidden={annotationControls.active || undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background transition-colors duration-100 ease-out motion-reduce:transition-none"
        >
          {isUnavailable ? (
            <UnavailablePage onOpenOverview={() => openTab('overview')} />
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
                !!pendingView.buildSessionId &&
                isSessionRunning(sessionActivity, workspaceId, pendingView.buildSessionId)
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
              onOpenChat={() => openChat()}
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
        <WorkspaceUsersMenu
          workspaceId={workspaceId}
          describeTab={tab => tabItemFor(tab, allViews, false, () => false)}
          onOpenTab={openTab}
        />
        {canUseSplit && mode === 'fullscreen' && (
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
    </WorkspacePane>
  )

  return (
    <WorkspaceFrame
      frame={frame}
      workspace={workspacePanel}
      chat={dockedChat}
      onClick={onNavigationClick}
    >
      {mode === 'fullscreen' && (
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
              {...chatPanelProps}
              active={floatingChatOpen}
              onClose={onClose}
              annotation={popupAnnotation}
            />
          )}
        </ChatPopup>
      )}
    </WorkspaceFrame>
  )
}
