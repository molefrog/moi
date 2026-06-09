import { useEffect, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { IconArtboard, IconLayoutDashboard, IconLayoutGrid, IconPalette } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'

import {
  useWorkspaceSessions,
  useWorkspaceWidgets,
  workspaceKeys
} from '@/client/api/workspaces'
import { ChatPanel } from '@/client/components/ChatPanel'
import { ChatPopup } from '@/client/components/ChatPopup'
import { McpMenu } from '@/client/components/McpMenu'
import { type WidgetMode, Widgets } from '@/client/components/Widgets'
import { PanelHeader, SidebarLayout, SidebarToggle } from '@/client/components/layout/SidebarLayout'
import { LedLogo } from '@/client/components/playground/LedLogo'
import { Button } from '@/client/components/ui/button'
import { useChat } from '@/client/hooks/useChat'
import { useFitsSidebar } from '@/client/hooks/useFitsSidebar'
import { useGridReconcile } from '@/client/hooks/useGridReconcile'
import { useMeiEvent } from '@/client/hooks/useMeiEvents'
import { useWorkspaceTheme } from '@/client/hooks/useWorkspaceTheme'
import { Workspace } from '@/client/lib/WorkspaceContext'
import { WorkspaceLayoutProvider, useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import { ChatStoreProvider, useChatStoreApi } from '@/client/store/chat'
import type { SessionInfo, WidgetInfo } from '@/lib/types'

type WorkspaceRouteProps = {
  id: string
}

// Route component for `/workspace/:id` — provides workspace id + layout context,
// then loads. Layout and widgets are React Query resources; chat (sessions,
// events, websocket) still runs on the Zustand stores, seeded from the sessions
// query below.
export function WorkspaceRoute({ id }: WorkspaceRouteProps) {
  return (
    <Workspace id={id}>
      <WorkspaceLayoutProvider id={id}>
        <WorkspaceLoader id={id} />
      </WorkspaceLayoutProvider>
    </Workspace>
  )
}

type WorkspaceLoaderProps = {
  id: string
}

function WorkspaceLoader({ id }: WorkspaceLoaderProps) {
  const qc = useQueryClient()
  const { layout, setLayout, cwd, isLoading: layoutLoading } = useWorkspaceLayoutCtx()
  const widgets = useWorkspaceWidgets(id)
  const sessions = useWorkspaceSessions(id)

  // Keep the grid balanced as widgets come and go. (Theme is applied inside
  // WorkspaceView, scoped to the panel — see useWorkspaceTheme there.)
  useGridReconcile(id, widgets.data, layout, setLayout)

  // Server-pushed changes invalidate the matching query so the next render
  // revalidates (theme re-applies; the grid reconcile places any new widget).
  useMeiEvent(e => {
    if (e.type === 'theme:updated') {
      qc.invalidateQueries({ queryKey: workspaceKeys.layout(id) })
    } else if (e.type === 'widget-layout:updated') {
      qc.invalidateQueries({ queryKey: workspaceKeys.widgets(id) })
    }
  })

  // Fresh visit (nothing cached) → centered MOI logo in the panel. Switch-back
  // shows cached data immediately while it revalidates, so no loader then.
  const fresh = layoutLoading || widgets.isLoading

  // One chat store per workspace mount: switching workspaces unmounts this and
  // discards its chat state cleanly. cwd flows in so turn metadata can show it.
  return (
    <ChatStoreProvider cwd={cwd}>
      <SeedActiveSession sessions={sessions.data} />
      <SidebarLayout>
        {fresh ? (
          <div className="flex h-full items-center justify-center">
            <LedLogo sprite="moi" effect="chaos" />
          </div>
        ) : (
          <WorkspaceView widgets={widgets.data ?? []} />
        )}
      </SidebarLayout>
    </ChatStoreProvider>
  )
}

type SeedActiveSessionProps = {
  sessions: SessionInfo[] | undefined
}

// Picks an active thread once the sessions query resolves. A freshly-mounted
// workspace store starts with `activeSessionId: null`, so this selects the most
// recent thread; it also re-selects if the current one vanished from the list.
function SeedActiveSession({ sessions }: SeedActiveSessionProps) {
  const store = useChatStoreApi()
  useEffect(() => {
    if (!sessions) return
    const active = store.getState().activeSessionId
    const stillValid = active && sessions.some(s => s.sessionId === active)
    if (!stillValid) store.getState().setActiveSession(sessions[0]?.sessionId ?? null)
  }, [sessions, store])
  return null
}

const ACTION_VARIANTS = {
  from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
  to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
}

// Workspace subpage tabs (widgets / Scratchpad). Selection state is owned by
// WorkspaceView so the body can swap between the widget grid and the canvas.
type WorkspaceTab = 'widgets' | 'canvas'

type WorkspaceTabsProps = {
  tab: WorkspaceTab
  onTab: (tab: WorkspaceTab) => void
}

function WorkspaceTabs({ tab, onTab }: WorkspaceTabsProps) {
  // Active tab outline uses an inset shadow (not a border) so the box keeps the
  // exact h-7 footprint of the other header buttons — no 1px layout shift.
  const tabClass = (active: boolean) =>
    cn(
      'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors [&_svg]:size-[18px]',
      active
        ? 'bg-muted text-foreground shadow-[inset_0_0_0_1px_var(--border)]'
        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
    )

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={tabClass(tab === 'widgets')} onClick={() => onTab('widgets')}>
        <IconLayoutGrid stroke={1.75} />
        Widgets
      </button>
      <button type="button" className={tabClass(tab === 'canvas')} onClick={() => onTab('canvas')}>
        <IconArtboard stroke={1.75} />
        Scratchpad
      </button>
    </div>
  )
}

// Empty scratchpad canvas — a dotted-pattern page that fills the widget area.
// Placeholder for the infinite canvas that will live here; the dot grid is a
// repeating radial-gradient sized via background-size.
function ScratchpadCanvas() {
  return (
    <div className="min-h-0 flex-1 bg-muted/40 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] bg-[size:20px_20px] bg-[position:center]" />
  )
}

type WidgetActionsProps = {
  mode: WidgetMode
  onMode: (mode: WidgetMode) => void
}

// Widget controls — live in the page header (right side), always visible.
function WidgetActions({ mode, onMode }: WidgetActionsProps) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {mode !== 'idle' ? (
        <motion.div
          key="done"
          variants={ACTION_VARIANTS}
          initial="from"
          animate="to"
          exit="from"
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
        >
          <Button onClick={() => onMode('idle')}>Done</Button>
        </motion.div>
      ) : (
        <motion.div
          key="actions"
          className="flex items-center gap-1"
          variants={ACTION_VARIANTS}
          initial="from"
          animate="to"
          exit="from"
          transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
        >
          <Button
            variant="ghost"
            className="h-7 text-muted-foreground [&_svg]:size-[18px]"
            onClick={() => onMode('customizing')}
          >
            <IconPalette stroke={1.75} />
            Customize
          </Button>
          <Button
            variant="ghost"
            className="h-7 text-muted-foreground [&_svg]:size-[18px]"
            onClick={() => onMode('editing')}
          >
            <IconLayoutDashboard stroke={1.75} />
            Edit widgets
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

type WorkspaceViewProps = {
  widgets: WidgetInfo[]
}

function WorkspaceView({ widgets }: WorkspaceViewProps) {
  const { view, input, setInput, processing, error, send, stop, switchThread, dismissError } =
    useChat()
  const { layout, setLayout, name } = useWorkspaceLayoutCtx()
  const { ref: rowRef, fits: canFitSidebar } = useFitsSidebar<HTMLDivElement>()
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('idle')
  const [tab, setTab] = useState<WorkspaceTab>('widgets')

  // Theme is scoped to this wrapper, not :root — the sidebar keeps the default
  // tokens. The floating chat portals into the same element so it inherits them.
  const themeRef = useRef<HTMLDivElement>(null)
  useWorkspaceTheme(layout.theme, themeRef)

  const hasWidgets = widgets.length > 0
  // The chat always lives in the panel; "floating" only applies when there are
  // widgets to clear room for. With no widgets it fills the panel (LHS hidden).
  const chatMode: 'sidebar' | 'floating' =
    hasWidgets && (layout.chatMode === 'floating' || !canFitSidebar) ? 'floating' : 'sidebar'

  const handleModeChange = canFitSidebar
    ? (mode: 'sidebar' | 'floating') => setLayout({ chatMode: mode })
    : undefined

  const chatPanel = (
    <ChatPanel
      view={view}
      input={input}
      setInput={setInput}
      processing={processing}
      error={error}
      onDismissError={dismissError}
      send={send}
      stop={stop}
      chatMode={chatMode}
      onSwitchThread={switchThread}
      onModeChange={handleModeChange}
      onCollapse={() => setLayout({ chatMode: 'floating' })}
      // With no widgets there's no LHS header beside the chat, so host the
      // sidebar toggle in the chat header instead.
      leading={hasWidgets ? undefined : <SidebarToggle />}
    />
  )

  return (
    // Themed wrapper: scoped CSS vars (bg/fg/font) live here so the panel — and
    // the portaled floating chat — pick up the workspace theme, while the
    // sidebar outside stays default.
    <div
      ref={themeRef}
      className="bg-background text-foreground flex h-full min-h-0 flex-col font-sans"
    >
      {/* Two-pane panel split. LHS = workspace header + scrollable widgets;
          RHS = the chat (its own header included). With no widgets the LHS is
          dropped and the chat fills the whole panel. */}
      <div ref={rowRef} className="flex h-full min-h-0">
        {hasWidgets && (
          <div className="border-border flex min-h-0 min-w-[var(--column-w)] flex-1 flex-col border-r">
            <PanelHeader>
              <SidebarToggle />
              {name && <span className="text-foreground truncate text-sm font-medium">{name}</span>}
              <span className="text-muted-foreground/40 select-none text-sm">/</span>
              <WorkspaceTabs tab={tab} onTab={setTab} />
              <div className="flex-1" />
              {tab === 'widgets' && <WidgetActions mode={widgetMode} onMode={setWidgetMode} />}
              <McpMenu />
            </PanelHeader>
            {tab === 'widgets' ? (
              <Widgets mode={widgetMode} widgets={widgets} />
            ) : (
              <ScratchpadCanvas />
            )}
          </div>
        )}

        {chatMode === 'sidebar' && (
          <div
            className={cn(
              'flex min-h-0 flex-col overflow-hidden px-3 pb-4 pt-2',
              // Docked chat: caps at --chat-max on big screens (grow 0), shrinks
              // down to --chat-min before the fit check flips it to floating.
              hasWidgets ? 'min-w-[var(--chat-min)] flex-[0_1_var(--chat-max)]' : 'flex-1'
            )}
          >
            {/* No widgets → the chat fills the panel, so cap and center it. */}
            <div
              className={cn(
                'flex min-h-0 w-full flex-1 flex-col',
                !hasWidgets && 'mx-auto max-w-[var(--column-w)]'
              )}
            >
              {chatPanel}
            </div>
          </div>
        )}
      </div>

      {chatMode === 'floating' && (
        <ChatPopup
          defaultOpen={layout.chatMode === 'floating' && canFitSidebar}
          container={themeRef}
        >
          {onClose => (
            <ChatPanel
              view={view}
              input={input}
              setInput={setInput}
              processing={processing}
              error={error}
              onDismissError={dismissError}
              send={send}
              stop={stop}
              chatMode={chatMode}
              onSwitchThread={switchThread}
              onModeChange={handleModeChange}
              onClose={onClose}
            />
          )}
        </ChatPopup>
      )}
    </div>
  )
}
