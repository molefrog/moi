import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import {
  IconArticle,
  IconGhost,
  IconLayout2,
  IconLayoutSidebarRight,
  IconPalette,
  IconSketching
} from '@tabler/icons-react'
import { ChatPanel } from '@/client/features/chat/ChatPanel'
import { ChatPopup } from '@/client/features/chat/ChatPopup'
import { CustomizePanel } from '@/client/features/workspace/CustomizePanel'
import { McpMenu } from '@/client/features/connectors/McpMenu'
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
import { useWorkspaceTheme } from '@/client/features/workspace/useWorkspaceTheme'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import { liveStore } from '@/client/features/chat/chat-store'
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

const Scratchpad = lazy(() =>
  import('@/client/features/scratchpad/Scratchpad').then(module => ({
    default: module.Scratchpad
  }))
)

// Tab label for a view: its configured title, or the file-name id as fallback.
const viewLabel = (v: ViewInfo) => v.config.title || v.id

const DEFAULT_TABS: WorkspaceTabsState = { open: ['agent'], active: 'agent' }

const viewTabId = (id: string): WorkspaceTabId => `view:${id}`
const viewIdFromTab = (tab: WorkspaceTabId) => (tab.startsWith('view:') ? tab.slice(5) : null)
const viewBuilderTabId = (id: string): WorkspaceTabId => `view-builder:${id}`
const viewBuilderIdFromTab = (tab: WorkspaceTabId) =>
  tab.startsWith('view-builder:') ? tab.slice('view-builder:'.length) : null

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
}

// A view — an agent-defined app — mounted full-area. The bundle owns its own
// layout + scroll, so we give it a plain filled box and fade it in (mirroring
// WidgetShell, but full-area instead of a grid cell).
function ViewApp({ view }: ViewAppProps) {
  const bundle = useView(view.id)

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {bundle.status === 'ready' && (
          <motion.div
            key={bundle.version}
            className="absolute inset-0 overflow-auto"
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <WidgetErrorBoundary name={view.id} resetKey={bundle.version}>
              <bundle.Component />
            </WidgetErrorBoundary>
          </motion.div>
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
    <Tooltip delay={50}>
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
}

type WidgetMode = 'idle' | 'editing' | 'customizing'

function normalizeTabsState(tabs: WorkspaceTabsState | undefined): WorkspaceTabsState {
  if (!tabs || !Array.isArray(tabs.open)) return DEFAULT_TABS
  const open = tabs.open.filter((tab, index, all) => all.indexOf(tab) === index)
  if (open.length === 0) return DEFAULT_TABS
  return { open, active: open.includes(tabs.active) ? tabs.active : open[0] }
}

function tabAvailable(tab: WorkspaceTabId, views: ViewInfo[], builders: ViewBuilder[]) {
  if (tab === 'agent' || tab === 'widgets' || tab === 'scratchpad') return true
  const builderId = viewBuilderIdFromTab(tab)
  if (builderId) return builders.some(builder => builder.id === builderId)
  const viewId = viewIdFromTab(tab)
  return viewId ? views.some(v => v.id === viewId) : false
}

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
      Icon: IconArticle,
      label: builder.title || builder.viewId || 'New view',
      closable
    }
  }
  const viewId = viewIdFromTab(tab)
  const view = viewId ? views.find(v => v.id === viewId) : null
  return view
    ? {
        key: tab,
        Icon: IconArticle,
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
  const availableOpenTabs = tabsState.open.filter(tab => tabAvailable(tab, views, builders))
  const effectiveOpenTabs = availableOpenTabs.length > 0 ? availableOpenTabs : DEFAULT_TABS.open
  const openSet = new Set(tabsState.open)
  const nonAgentOpenTabs = effectiveOpenTabs.filter(tab => tab !== 'agent')
  const hasWorkspaceContent = nonAgentOpenTabs.length > 0

  // Effective layout mode. Split is only visible with workspace content and
  // enough row width; the saved mode remains the user's intent.
  const wantsSplit = layout.layoutMode === 'split' && hasWorkspaceContent
  const mode: LayoutMode = wantsSplit && canUseSplit ? 'split' : 'fullscreen'
  const dockedSplit = mode === 'split'

  const setMode = (m: LayoutMode) => {
    if (m === 'split' && tabsState.active === 'agent') {
      setLayout({
        layoutMode: m,
        tabs: {
          open: tabsState.open,
          active: nonAgentOpenTabs[0] ?? tabsState.active
        }
      })
      return
    }
    setLayout({ layoutMode: m })
  }

  const visibleTabIds = dockedSplit ? nonAgentOpenTabs : effectiveOpenTabs
  const activeTab: WorkspaceTabId = visibleTabIds.includes(tabsState.active)
    ? tabsState.active
    : (visibleTabIds[0] ?? 'agent')
  const canCloseTabs = effectiveOpenTabs.length > 1
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

  useEffect(() => {
    const open = tabsState.open.filter(tab => tabAvailable(tab, views, builders))
    if (open.length === tabsState.open.length) return
    const nextOpen = open.length > 0 ? open : DEFAULT_TABS.open
    setLayout({
      tabs: {
        open: nextOpen,
        active: nextOpen.includes(tabsState.active) ? tabsState.active : nextOpen[0]
      }
    })
  }, [builders, setLayout, tabsState.active, tabsState.open, views])

  useEffect(() => {
    const replacements = new Map<WorkspaceTabId, WorkspaceTabId>()
    for (const builder of builders) {
      if (builder.status !== 'ready' || !builder.viewId) continue
      if (!views.some(view => view.id === builder.viewId)) continue
      replacements.set(viewBuilderTabId(builder.id), viewTabId(builder.viewId))
    }
    if (replacements.size === 0) return

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
  }, [builders, setLayout, tabsState.active, tabsState.open, views])

  useEffect(() => {
    const linked = activeBuilder ?? builders.find(builder => builder.viewId === activeViewId)
    if (linked) liveStore.getState().setActive(workspaceId, linked.sessionId)
  }, [activeBuilder, activeViewId, builders, workspaceId])

  useEffect(() => {
    if (mode !== 'fullscreen' || activeTab === 'agent') {
      setFloatingChatOpen(false)
    }
  }, [activeTab, mode])

  const setTabs = (tabs: WorkspaceTabsState) => {
    tabsStateRef.current = tabs
    setLayout({ tabs })
  }

  const openTab = (tab: WorkspaceTabId) => {
    const current = tabsStateRef.current
    const open = current.open.includes(tab) ? current.open : [...current.open, tab]
    setTabs({ open, active: tab })
    if (tab === 'agent') {
      setFloatingChatOpen(false)
      setChatFocusRequest(request => request + 1)
    }
  }

  const closeTab = (tab: WorkspaceTabId) => {
    const builderId = viewBuilderIdFromTab(tab)
    const builder = builderId ? builders.find(candidate => candidate.id === builderId) : undefined
    if ((!canCloseTabs && !builder) || !openSet.has(tab)) return
    let open = tabsState.open.filter(t => t !== tab)
    if (open.length === 0) open = ['agent']
    let active = tabsState.active
    if (active === tab || !open.includes(active)) {
      const visibleIndex = visibleTabIds.indexOf(tab)
      active =
        visibleTabIds[visibleIndex + 1] ??
        visibleTabIds[visibleIndex - 1] ??
        open.find(t => tabAvailable(t, views, builders)) ??
        'agent'
    }
    setTabs({ open, active })
    if (builder?.status === 'draft') void builderActions.discard(builder.id)
  }

  const discardBuilder = (builder: ViewBuilder) => {
    const tab = viewBuilderTabId(builder.id)
    if (openSet.has(tab)) {
      let open = tabsState.open.filter(item => item !== tab)
      if (open.length === 0) open = ['agent']
      setTabs({ open, active: tabsState.active === tab ? open[0] : tabsState.active })
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
          Icon: IconArticle,
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
          Icon: IconArticle,
          label: builder.title || builder.viewId || 'New view',
          onClick: () => openTab(tab)
        })
      ),
    {
      key: 'create-view',
      Icon: IconArticle,
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
                <McpMenu />
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
              <ViewApp view={activeView} />
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
