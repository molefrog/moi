import { lazy, Suspense, useEffect, useState } from 'react'

import { AnimatePresence } from 'motion/react'

import {
  IconArticle,
  IconBrowserPlus,
  IconLayout2,
  IconLayoutSidebarRight,
  IconLetterCase,
  IconSketching
} from '@tabler/icons-react'

import { IconGhost } from '@/client/components/shared/IconGhost'
import {
  canAnnotateWorkspaceContent,
  type WorkspaceAnnotationMode
} from '@/client/features/annotations/annotation-availability'
import { useChatAnnotation } from '@/client/features/annotations/useChatAnnotation'
import { ChatPanel } from '@/client/features/chat/ChatPanel'
import { ChatPopup } from '@/client/features/chat/ChatPopup'
import { CustomizePanel } from '@/client/features/workspace/CustomizePanel'
import { useAppletEvent } from '@/client/features/applets/applet-runtime'
import { Widgets } from '@/client/features/widgets/Widgets'
import { PanelHeader } from '@/client/components/shared/PanelHeader'
import { workspaceProviderIcon } from '@/client/features/home/workspace-presentation'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { WorkspaceSettings } from '@/client/features/settings/WorkspaceSettings'
import { useAppletChatMessage } from '@/client/features/chat/useAppletChatMessage'
import { useChat } from '@/client/features/chat/useChat'
import { ViewBuilderTab } from '@/client/features/views/ViewBuilderTab'
import { ViewManager } from '@/client/features/views/ViewManager'
import { useViewBuilderActions } from '@/client/features/views/useViewBuilderActions'
import { useFitsSplitLayout } from '@/client/features/workspace/useFitsSplitLayout'
import { useWorkspaceComposerState } from '@/client/features/chat/composer/useWorkspaceComposerState'
import { useWorkspaceTheme } from '@/client/runtime/workspace-theme'
import {
  hasRunningWorkspaceActivity,
  isSessionRunning,
  useLive
} from '@/client/features/chat/chat-store'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import {
  effectiveOpenTabs,
  normalizeTabsState,
  tabAvailable
} from '@/client/features/workspace/tab-resolution'
import { useWorkspaceNavigation } from '@/client/features/workspace/useWorkspaceNavigation'
import { resolveAppIcon } from '@/client/lib/app-icon-registry'
import { cn } from '@/client/lib/cn'
import { useWorkspaceEvent } from '@/client/runtime/useWorkspaceEvents'
import { useUiStore } from '@/client/store/ui'
import {
  type CreateWorkspaceTabItem,
  type WorkspaceTabItem,
  WorkspaceTabs
} from '@/client/features/workspace/WorkspaceTabs'
import type { LayoutMode, ViewBuilder, ViewInfo, WidgetInfo, WorkspaceTabId } from '@/lib/types'
import {
  viewBuilderIdFromTab,
  viewBuilderTabId,
  viewIdFromTab,
  viewTabId
} from '@/lib/workspace-tabs'

import { ChatAnnotationSurface } from '../annotations/AnnotationOverlay'
import { WorkspaceSplitLayout } from './WorkspaceSplitLayout'

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
  onToggleMode: () => void
}

// Full-screen workspace action: open the chat as a docked split column.
function SectionControls({ onToggleMode }: SectionControlsProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" onClick={onToggleMode} aria-label="Dock agent">
            <IconLayoutSidebarRight stroke={1.75} />
          </Button>
        }
      />
      <TooltipContent>Dock agent</TooltipContent>
    </Tooltip>
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
            <IconLetterCase stroke={1.75} />
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
}

function tabItemFor(
  tab: WorkspaceTabId,
  views: ViewInfo[],
  builders: ViewBuilder[],
  closable: boolean,
  agentRunning: boolean,
  builderRunning: (sessionId: string) => boolean
): WorkspaceTabItem | null {
  if (tab === 'agent') {
    return {
      key: tab,
      Icon: IconGhost,
      label: 'Agent',
      closable,
      loading: agentRunning
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
      closable,
      loading: builderRunning(builder.sessionId)
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

export function WorkspaceScreen({ widgets, views, builders }: WorkspaceScreenProps) {
  const { layout, setLayout, name, icon, provider, workspaceId } = useWorkspaceLayoutCtx()
  const builderActions = useViewBuilderActions()
  const {
    ref: rowRef,
    fits: canUseSplit,
    constraints: splitLayoutConstraints
  } = useFitsSplitLayout<HTMLDivElement>()
  const [widgetMode, setWidgetMode] = useState<WorkspaceAnnotationMode>('idle')
  const [floatingChatOpen, setFloatingChatOpen] = useState(false)
  const [chatFocusRequest, setChatFocusRequest] = useState(0)
  const dockedChatWidth = useUiStore(state => state.dockedChatWidth)
  const setDockedChatWidth = useUiStore(state => state.setDockedChatWidth)
  const sessionActivity = useLive(state => state.activity)
  const hasRunningSession = hasRunningWorkspaceActivity(sessionActivity, workspaceId)

  useWorkspaceTheme(layout.theme)

  // Split needs the open set to decide whether it's available at all, and the
  // navigation hook needs split to resolve the active tab — so the open set is
  // derived from the raw layout here, before either.
  const openTabIds = effectiveOpenTabs(normalizeTabsState(layout.tabs), views, builders)
  const nonAgentOpenTabs = openTabIds.filter(tab => tab !== 'agent')
  const hasWorkspaceContent = nonAgentOpenTabs.length > 0

  // Effective layout mode. Split is only visible with workspace content and
  // enough row width; the saved mode remains the user's intent.
  const wantsSplit = layout.layoutMode === 'split' && hasWorkspaceContent
  const mode: LayoutMode = wantsSplit && canUseSplit ? 'split' : 'fullscreen'
  const dockedSplit = mode === 'split'

  // The tab address: URL in, active tab + applet params out, plus the persisted
  // tab state it keeps in sync. See useWorkspaceNavigation for the invariants.
  const { tabsState, activeTab, appletParams, navigateToTab, setTabs } = useWorkspaceNavigation({
    views,
    builders,
    split: dockedSplit
  })

  // Chat comes after navigation, and takes the address: every message carries
  // where the user is (active tab, and the params the view is rendering with)
  // in its `<moi-context>` envelope.
  const {
    view,
    chatLoaded,
    previewTurn,
    sessionId,
    processing,
    error,
    send,
    stop,
    selectSession,
    dismissError
  } = useChat({ activeTab, appletParams })
  const { composerBanner, composerAvailability } = useWorkspaceComposerState(workspaceId, {
    chatError: error,
    onDismissChatError: dismissError
  })

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
      tabItemFor(
        tab,
        views,
        builders,
        canCloseTabs || viewBuilderIdFromTab(tab) !== null,
        hasRunningSession,
        sessionId => isSessionRunning(sessionActivity, workspaceId, sessionId)
      )
    )
    .filter((tab): tab is WorkspaceTabItem => Boolean(tab))
  const activeViewId = viewIdFromTab(activeTab)
  const activeView = activeViewId ? views.find(v => v.id === activeViewId) : undefined
  const activeBuilderId = viewBuilderIdFromTab(activeTab)
  const activeBuilder = activeBuilderId
    ? builders.find(builder => builder.id === activeBuilderId)
    : undefined
  const canAnnotate = canAnnotateWorkspaceContent(activeTab, widgetMode, activeView !== undefined)
  const annotation = useChatAnnotation({
    workspaceId,
    sessionId,
    activeTab,
    mode,
    available: canAnnotate,
    closePopup: () => setFloatingChatOpen(false),
    openPopup: () => setFloatingChatOpen(true)
  })

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
    if (urlReplacement) navigateToTab(urlReplacement)

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
  }, [activeTab, builders, navigateToTab, setLayout, tabsState, views])

  useEffect(() => {
    if (mode !== 'fullscreen' || activeTab === 'agent') {
      setFloatingChatOpen(false)
    }
  }, [activeTab, mode])

  // Tab switching is navigation; the saved default and the open set follow via
  // the navigation hook. Only the chat side effects belong to the screen.
  const openTab = (tab: WorkspaceTabId, params?: Record<string, unknown>) => {
    navigateToTab(tab, params)
    if (tab === 'agent') {
      setFloatingChatOpen(false)
      setChatFocusRequest(request => request + 1)
    }
  }

  // Focus requests from applet bridges arrive here already validated — the
  // applet runtime narrows the untrusted tab id and params shape at the trust
  // boundary (applet-runtime.ts). A well-formed id for a missing view just
  // resolves to the default like any dead URL.
  useAppletEvent(workspaceId, 'focusTab', openTab)

  // `moi tab focus` — a workspace event, not an applet call: the control
  // server validated the target and params before publishing.
  useWorkspaceEvent(event => {
    if (event.type === 'tab:focus' && event.workspaceId === workspaceId) {
      openTab(event.tab, event.params)
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
    if (activeTab === tab) navigateToTab(nextTab)
    if (builder?.status === 'draft') void builderActions.discard(builder.id)
  }

  const discardBuilder = (builder: ViewBuilder) => {
    const tab = viewBuilderTabId(builder.id)
    if (openSet.has(tab)) {
      let open = tabsState.open.filter(item => item !== tab)
      if (open.length === 0) open = ['agent']
      setTabs({ open, active: tabsState.active === tab ? open[0] : tabsState.active })
      if (activeTab === tab) navigateToTab(open[0])
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
      useUiStore.getState().setComposerDraft(workspaceId, intent)
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
  useAppletChatMessage({ send, revealChat: openChat, composerAvailability })

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
        // Do NOT select the draft's pre-minted sessionId here: no session
        // exists behind it until submit, so making it the chat selection turns
        // the chat into a dead "New chat" whose sends try to resume a session
        // that isn't there. Submit selects it once the chat actually starts.
        void builderActions.create().then(builder => openTab(viewBuilderTabId(builder.id)))
      }
    }
  ]

  // The docked split chat. Full-screen Agent uses the tabbed chat below.
  const dockedChat = (
    <ChatPanel
      active={mode === 'split'}
      focusRequest={chatFocusRequest}
      chatLoaded={chatLoaded}
      view={view}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      composerBanner={composerBanner}
      composerAvailability={composerAvailability}
      send={send}
      stop={stop}
      onSelectSession={selectSession}
      onClose={() => setMode('fullscreen')}
      annotation={annotation.docked}
      docked
    />
  )

  const tabbedChat = (
    <ChatPanel
      active={mode === 'fullscreen' && activeTab === 'agent'}
      focusRequest={chatFocusRequest}
      chatLoaded={chatLoaded}
      view={view}
      previewTurn={previewTurn}
      sessionId={sessionId}
      processing={processing}
      composerBanner={composerBanner}
      composerAvailability={composerAvailability}
      send={send}
      stop={stop}
      onSelectSession={selectSession}
    />
  )
  const workspacePanel = (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col-reverse overflow-hidden bg-background shadow-xs transition-[border-radius]',
        mode === 'split' && 'rounded-xl'
      )}
    >
      <ChatAnnotationSurface
        controller={annotation}
        className="flex min-h-0 flex-1"
        contentClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        {activeTab === 'agent' ? (
          tabbedChat
        ) : activeTab === 'widgets' ? (
          <Widgets
            editing={widgetMode === 'editing'}
            onEditingChange={editing => setWidgetMode(editing ? 'editing' : 'idle')}
            widgets={widgets}
            onCreateWidget={() => {
              selectSession(null)
              openChat('Create widget')
            }}
          />
        ) : activeTab === 'scratchpad' ? (
          <Suspense fallback={null}>
            <Scratchpad />
          </Suspense>
        ) : activeBuilder ? (
          <ViewBuilderTab
            key={activeBuilder.id}
            builder={activeBuilder}
            composerAvailability={composerAvailability}
            onSave={requirements => builderActions.save(activeBuilder.id, requirements)}
            onSubmit={requirements => {
              if (mode === 'fullscreen') setFloatingChatOpen(true)
              return builderActions.submit(activeBuilder, requirements)
            }}
            onOpenChat={() => {
              selectSession(activeBuilder.sessionId)
              openChat()
            }}
            onDiscard={() => discardBuilder(activeBuilder)}
          />
        ) : null}

        {/* Views are not part of the chain above: ViewManager keeps them
              mounted across tab switches (and collapses to nothing while
              another tab is on screen), which is what makes a switch back
              instant. */}
        <ViewManager views={views} activeViewId={activeView?.id ?? null} params={appletParams} />
      </ChatAnnotationSurface>

      <PanelHeader>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex items-center gap-2">
            <img
              src={icon ?? workspaceProviderIcon[provider ?? 'claude-code']}
              alt=""
              className="size-5 shrink-0 rounded-xs"
            />
            {name && <span className="truncate text-sm font-medium text-foreground">{name}</span>}
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
            onToggle={() => setWidgetMode(widgetMode === 'customizing' ? 'idle' : 'customizing')}
          />
          <WorkspaceSettings />
          {hasWorkspaceContent && canUseSplit && mode === 'fullscreen' && (
            <SectionControls onToggleMode={() => setMode('split')} />
          )}
        </div>
      </PanelHeader>
    </div>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col font-sans text-foreground">
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

      <AnimatePresence>
        {widgetMode === 'customizing' && <CustomizePanel onClose={() => setWidgetMode('idle')} />}
      </AnimatePresence>

      {mode === 'fullscreen' && activeTab !== 'agent' && hasWorkspaceContent && (
        <ChatPopup
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
              active={floatingChatOpen}
              focusRequest={chatFocusRequest}
              chatLoaded={chatLoaded}
              view={view}
              previewTurn={previewTurn}
              sessionId={sessionId}
              processing={processing}
              composerBanner={composerBanner}
              composerAvailability={composerAvailability}
              send={send}
              stop={stop}
              onSelectSession={selectSession}
              onClose={onClose}
              annotation={annotation.popup}
            />
          )}
        </ChatPopup>
      )}
    </div>
  )
}
