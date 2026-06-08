import { useEffect, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { IconLayoutDashboard, IconPalette } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'

import { useWorkspaceSessions, useWorkspaceWidgets, workspaceKeys } from '@/client/api/workspaces'
import { ChatPanel } from '@/client/components/ChatPanel'
import { ChatPopup } from '@/client/components/ChatPopup'
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
import { useSessionsStore } from '@/client/store/sessions'
import { useWorkspaceStore } from '@/client/store/workspace'
import type { WidgetInfo } from '@/lib/types'

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
  const { layout, setLayout, name, cwd, isLoading: layoutLoading } = useWorkspaceLayoutCtx()
  const widgets = useWorkspaceWidgets(id)
  const sessions = useWorkspaceSessions(id)

  // Apply theme + keep the grid balanced as widgets come and go.
  useWorkspaceTheme(layout.theme)
  useGridReconcile(id, widgets.data, layout, setLayout)

  // Workspace metadata the chat layer reads from the store (TurnView uses cwd).
  useEffect(() => {
    useWorkspaceStore.setState({ id, cwd, name })
  }, [id, cwd, name])

  // Seed the chat stores from the sessions query: populate the thread list and
  // pick an active session (reset when switching to a workspace that doesn't
  // contain the currently-active one).
  useEffect(() => {
    if (!sessions.data) return
    useSessionsStore.setState({ list: sessions.data, status: 'ready' })
    const active = useWorkspaceStore.getState().activeSessionId
    const stillValid = active && sessions.data.some(s => s.sessionId === active)
    if (!stillValid) {
      useWorkspaceStore.getState().setActiveSession(sessions.data[0]?.sessionId ?? null)
    }
  }, [sessions.data])

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

  return (
    <SidebarLayout>
      {fresh ? (
        <div className="flex h-full items-center justify-center">
          <LedLogo sprite="moi" effect="chaos" />
        </div>
      ) : (
        <WorkspaceView widgets={widgets.data ?? []} />
      )}
    </SidebarLayout>
  )
}

const ACTION_VARIANTS = {
  from: { opacity: 0, scale: 0.8, filter: 'blur(4px)' },
  to: { opacity: 1, scale: 1, filter: 'blur(0px)' }
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
            className="text-muted-foreground [&_svg]:size-[18px]"
            onClick={() => onMode('customizing')}
          >
            <IconPalette stroke={1.75} />
            Customize
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground [&_svg]:size-[18px]"
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
    <>
      {/* Two-pane panel split. LHS = workspace header + scrollable widgets;
          RHS = the chat (its own header included). With no widgets the LHS is
          dropped and the chat fills the whole panel. */}
      <div ref={rowRef} className="flex h-full min-h-0">
        {hasWidgets && (
          <div className="border-border flex min-h-0 min-w-[var(--column-w)] flex-1 flex-col border-r">
            <PanelHeader>
              <SidebarToggle />
              {name && <span className="text-foreground truncate text-sm font-medium">{name}</span>}
              <div className="flex-1" />
              <WidgetActions mode={widgetMode} onMode={setWidgetMode} />
            </PanelHeader>
            <Widgets mode={widgetMode} widgets={widgets} />
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
        <ChatPopup defaultOpen={layout.chatMode === 'floating' && canFitSidebar}>
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
    </>
  )
}
