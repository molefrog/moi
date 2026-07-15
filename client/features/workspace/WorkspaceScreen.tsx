import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import {
  IconAppWindow,
  IconArtboard,
  IconLayoutGrid,
  IconLayoutSidebarRight,
  IconPalette,
  IconRobotFace
} from '@tabler/icons-react'
import { ChatPanel } from '@/client/features/chat/ChatPanel'
import { ChatPopup } from '@/client/features/chat/ChatPopup'
import { CustomizePanel } from '@/client/features/workspace/CustomizePanel'
import { McpMenu } from '@/client/features/connectors/McpMenu'
import { AppletMount } from '@/client/features/applets/AppletMount'
import { WidgetErrorBoundary } from '@/client/features/applets/WidgetErrorBoundary'
import { Widgets } from '@/client/features/widgets/Widgets'
import { PanelHeader } from '@/client/components/shared/PanelHeader'
import { workspaceProviderIcon } from '@/client/features/home/workspace-presentation'
import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { WorkspaceSettings } from '@/client/features/settings/WorkspaceSettings'
import { useChat } from '@/client/features/chat/useChat'
import { useView } from '@/client/features/applets/useApplet'
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
              <AppletMount segment="views" name={view.id} version={bundle.version}>
                <bundle.Component />
              </AppletMount>
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
}

type WidgetMode = 'idle' | 'editing' | 'customizing'

function normalizeTabsState(tabs: WorkspaceTabsState | undefined): WorkspaceTabsState {
  if (!tabs || !Array.isArray(tabs.open)) return DEFAULT_TABS
  const open = tabs.open.filter((tab, index, all) => all.indexOf(tab) === index)
  if (open.length === 0) return DEFAULT_TABS
  return { open, active: open.includes(tabs.active) ? tabs.active : open[0] }
}

function tabAvailable(tab: WorkspaceTabId, views: ViewInfo[]) {
  if (tab === 'agent' || tab === 'widgets' || tab === 'scratchpad') return true
  const viewId = viewIdFromTab(tab)
  return viewId ? views.some(v => v.id === viewId) : false
}

function tabItemFor(
  tab: WorkspaceTabId,
  views: ViewInfo[],
  closable: boolean
): WorkspaceTabItem | null {
  if (tab === 'agent') {
    return {
      key: tab,
      Icon: IconRobotFace,
      label: 'Agent',
      closable
    }
  }
  if (tab === 'widgets') {
    return {
      key: tab,
      Icon: IconLayoutGrid,
      label: 'Widgets',
      closable
    }
  }
  if (tab === 'scratchpad') {
    return {
      key: tab,
      Icon: IconArtboard,
      label: 'Scratchpad',
      closable
    }
  }
  const viewId = viewIdFromTab(tab)
  const view = viewId ? views.find(v => v.id === viewId) : null
  return view
    ? {
        key: tab,
        Icon: IconAppWindow,
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

export function WorkspaceScreen({ widgets, views }: WorkspaceScreenProps) {
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
  const { ref: rowRef, fits: canUseSplit } = useFitsSplitLayout<HTMLDivElement>()
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('idle')
  const [floatingChatOpen, setFloatingChatOpen] = useState(false)
  const [chatFocusRequest, setChatFocusRequest] = useState(0)

  // Theme is scoped to this wrapper, not :root — the sidebar keeps the default
  // tokens. The floating chat portals into the same element so it inherits them.
  const themeRef = useRef<HTMLDivElement>(null)
  useWorkspaceTheme(layout.theme, themeRef)

  const tabsState = normalizeTabsState(layout.tabs)
  const availableOpenTabs = tabsState.open.filter(tab => tabAvailable(tab, views))
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
    .map(tab => tabItemFor(tab, views, canCloseTabs))
    .filter((tab): tab is WorkspaceTabItem => Boolean(tab))
  const activeViewId = viewIdFromTab(activeTab)
  const activeView = activeViewId ? views.find(v => v.id === activeViewId) : undefined

  useEffect(() => {
    if (mode !== 'fullscreen' || activeTab === 'agent') {
      setFloatingChatOpen(false)
    }
  }, [activeTab, mode])

  const setTabs = (tabs: WorkspaceTabsState) => setLayout({ tabs })

  const openTab = (tab: WorkspaceTabId) => {
    const open = openSet.has(tab) ? tabsState.open : [...tabsState.open, tab]
    setTabs({ open, active: tab })
    if (tab === 'agent') {
      setFloatingChatOpen(false)
      setChatFocusRequest(request => request + 1)
    }
  }

  const closeTab = (tab: WorkspaceTabId) => {
    if (!canCloseTabs || !openSet.has(tab)) return
    const open = tabsState.open.filter(t => t !== tab)
    let active = tabsState.active
    if (active === tab || !open.includes(active)) {
      const visibleIndex = visibleTabIds.indexOf(tab)
      active =
        visibleTabIds[visibleIndex + 1] ??
        visibleTabIds[visibleIndex - 1] ??
        open.find(t => tabAvailable(t, views)) ??
        'agent'
    }
    setTabs({ open, active })
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
            Icon: IconRobotFace,
            label: 'Agent',
            onClick: () => openTab('agent')
          }
        ] satisfies CreateWorkspaceTabItem[])
      : []),
    ...(!openSet.has('widgets')
      ? ([
          {
            key: 'widgets',
            Icon: IconLayoutGrid,
            label: 'Widgets',
            onClick: () => openTab('widgets')
          }
        ] satisfies CreateWorkspaceTabItem[])
      : []),
    ...(!openSet.has('scratchpad')
      ? ([
          {
            key: 'scratchpad',
            Icon: IconArtboard,
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
          Icon: IconAppWindow,
          label: viewLabel(view),
          onClick: () => openTab(tab)
        })
      ),
    {
      key: 'create-view',
      Icon: IconAppWindow,
      label: 'View',
      onClick: () => openChat('Create view')
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
            className={cn(
              'flex min-h-0 flex-1 flex-col',
              mode === 'split' && 'min-w-[var(--column-w)]'
            )}
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
              'flex min-h-0 min-w-[var(--chat-min)] flex-[0_1_var(--chat-max)] flex-col overflow-hidden border-l border-border'
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
