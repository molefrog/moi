import { useEffect } from 'react'

import { IconLoader2 } from '@tabler/icons-react'
import { Route, Switch, useLocation } from 'wouter'

import { useCanFitSidebar } from '@/client/hooks/useCanFitSidebar'
import { useChat } from '@/client/hooks/useChat'
import { useMeiEvent } from '@/client/hooks/useMeiEvents'
import { useWidgetSync } from '@/client/hooks/useWidgetSync'
import { useWorkspaceTheme } from '@/client/hooks/useWorkspaceTheme'
import { Workspace } from '@/client/lib/WorkspaceContext'
import { cn } from '@/client/lib/cn'
import { setWorkspaceSwitchHandler } from '@/client/lib/ws'
import { useSessionsStore } from '@/client/store/sessions'
import { useWidgetsStore } from '@/client/store/widgets'
import { useWorkspaceStore } from '@/client/store/workspace'

import { ChatPanel } from './ChatPanel'
import { ChatPopup } from './ChatPopup'
import { Widgets } from './Widgets'
import { WorkspacesPage } from './WorkspacesPage'

// Top-level router — sets up all client-side routes
export function AppRouter() {
  const [, navigate] = useLocation()

  // When the server broadcasts a workspace:switch (e.g. from `moi start`),
  // navigate to that workspace
  useEffect(() => {
    setWorkspaceSwitchHandler(id => navigate(`/workspace/${id}`))
    return () => setWorkspaceSwitchHandler(null)
  }, [navigate])

  return (
    <Switch>
      <Route path="/" component={WorkspacesPage} />
      <Route path="/workspace/:id">
        {(params: { id: string }) => (
          <Workspace id={params.id}>
            <WorkspaceLoader />
          </Workspace>
        )}
      </Route>
    </Switch>
  )
}

function WorkspaceLoader() {
  const workspaceStatus = useWorkspaceStore(s => s.status)
  const widgetsStatus = useWidgetsStore(s => s.status)
  const sessionsStatus = useSessionsStore(s => s.status)

  useWidgetSync()
  useWorkspaceTheme()

  useMeiEvent(e => {
    if (e.type === 'theme:updated') {
      const { id } = useWorkspaceStore.getState()
      useWorkspaceStore.getState().load(id)
    }
  })

  const isLoading =
    workspaceStatus === 'loading' || widgetsStatus === 'loading' || sessionsStatus === 'loading'

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 size={20} stroke={1.5} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  return <App />
}

function App() {
  const { view, input, setInput, processing, send, stop, switchThread } = useChat()
  const { layout, setLayout } = useWorkspaceStore()
  const { widgets } = useWidgetsStore()
  const canFitSidebar = useCanFitSidebar()
  const hasWidgets = widgets.length > 0
  const chatMode = !hasWidgets
    ? 'solo'
    : layout.chatMode === 'floating' || !canFitSidebar
      ? 'floating'
      : 'sidebar'

  const handleModeChange = canFitSidebar
    ? (mode: 'sidebar' | 'floating') => setLayout({ chatMode: mode })
    : undefined

  const chatPanel = (
    <ChatPanel
      view={view}
      input={input}
      setInput={setInput}
      processing={processing}
      send={send}
      stop={stop}
      chatMode={chatMode}
      onSwitchThread={switchThread}
      onModeChange={handleModeChange}
      onCollapse={() => setLayout({ chatMode: 'floating' })}
    />
  )

  const showSidebar = chatMode === 'sidebar'

  return (
    <div className="h-dvh overflow-hidden p-[var(--page-pad)]">
      <div className="mx-auto flex h-full w-full max-w-[var(--content-w)] justify-center">
        <div className="flex h-full min-h-0 w-full min-w-0 max-w-[var(--column-w)] flex-1 flex-col">
          {chatMode === 'solo' ? chatPanel : <Widgets />}
        </div>

        {canFitSidebar && chatMode !== 'solo' && (
          <div
            className={cn(
              'h-full shrink-0 transition-all ease-in-out',
              showSidebar
                ? 'w-[var(--sidebar-w)] opacity-100 duration-200'
                : 'w-0 opacity-0 duration-200'
            )}
          >
            <div className="h-full w-[var(--sidebar-w)] pl-[var(--sidebar-gap)]">{chatPanel}</div>
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
