import { useEffect } from 'react'

import { IconLoader2 } from '@tabler/icons-react'

import { useCanFitSidebar } from '@/client/hooks/useCanFitSidebar'
import { useChat } from '@/client/hooks/useChat'
import { useMeiEvent } from '@/client/hooks/useMeiEvents'
import { cn } from '@/client/lib/cn'
import { findFreePosition } from '@/client/lib/grid-pack'
import { useWidgetsStore } from '@/client/store/widgets'
import { useWorkspaceStore } from '@/client/store/workspace'

import { ChatPanel } from './ChatPanel'
import { ChatPopup } from './ChatPopup'
import { Widgets } from './Widgets'

export function AppLoader() {
  const workspaceStatus = useWorkspaceStore(s => s.status)
  const widgetsStatus = useWidgetsStore(s => s.status)

  useEffect(() => {
    useWorkspaceStore.getState().load()
    useWidgetsStore.getState().load()
  }, [])

  // Always-mounted handler — catches events even during loading
  useMeiEvent(e => {
    if (e.type !== 'widget-layout:updated') return
    useWidgetsStore.setState({ widgets: e.widgets, status: 'ready' })
    const { layout, setLayout } = useWorkspaceStore.getState()
    const gridIds = new Set(layout.widgetGrid.map(g => g.i))
    const newWidgets = e.widgets.filter(w => !gridIds.has(w.id))
    if (newWidgets.length > 0) {
      const grid = [...layout.widgetGrid]
      for (const w of newWidgets) {
        const pos = findFreePosition(grid, w.config.colSpan, w.config.rowSpan, 4)
        grid.push({ i: w.id, x: pos.x, y: pos.y, w: w.config.colSpan, h: w.config.rowSpan })
      }
      setLayout({ widgetGrid: grid })
    }
  })

  if (workspaceStatus === 'loading' || widgetsStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <IconLoader2 size={20} stroke={1.5} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  return <App />
}

function App() {
  const { messages, input, setInput, processing, send, stop } = useChat()
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
      messages={messages}
      input={input}
      setInput={setInput}
      processing={processing}
      send={send}
      stop={stop}
      chatMode={chatMode}
      onModeChange={handleModeChange}
      onCollapse={() => setLayout({ chatMode: 'floating' })}
    />
  )

  const showSidebar = chatMode === 'sidebar'

  return (
    <div className="min-h-screen p-8 max-lg:px-6 max-lg:py-6 max-sm:px-4 max-sm:py-4">
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1184px] justify-center',
          'min-h-[calc(100vh-4rem)] max-lg:min-h-[calc(100vh-3rem)] max-sm:min-h-[calc(100vh-2rem)]'
        )}
      >
        <div className="max-w-160 flex w-full min-w-0 flex-1 flex-col">
          {chatMode === 'solo' ? chatPanel : <Widgets />}
        </div>

        {canFitSidebar && chatMode !== 'solo' && (
          <div
            className={cn(
              'sticky top-10 shrink-0 self-start transition-all ease-in-out',
              'h-[calc(100vh-4rem)] max-lg:h-[calc(100vh-3rem)] max-sm:h-[calc(100vh-2rem)]',
              showSidebar ? 'w-[464px] opacity-100 duration-200' : 'w-0 opacity-0 duration-200'
            )}
          >
            <div className="h-full w-[464px] pl-6 lg:pl-16">{chatPanel}</div>
          </div>
        )}
      </div>

      {chatMode === 'floating' && (
        <ChatPopup defaultOpen={layout.chatMode === 'floating' && canFitSidebar}>
          {onClose => (
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              processing={processing}
              send={send}
              stop={stop}
              chatMode={chatMode}
              onModeChange={handleModeChange}
              onClose={onClose}
            />
          )}
        </ChatPopup>
      )}
    </div>
  )
}
