import { useState } from 'react'

import { useCanFitSidebar } from '@/client/hooks/useCanFitSidebar'
import { useChat } from '@/client/hooks/useChat'
import { useWidgetList } from '@/client/hooks/useWidgetList'
import { cn } from '@/client/lib/cn'

import { ChatPanel } from './ChatPanel'
import { ChatPopup } from './ChatPopup'
import { Widgets } from './Widgets'

export function App() {
  const { messages, input, setInput, processing, send, stop } = useChat()
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const canFitSidebar = useCanFitSidebar()
  const widgetNames = useWidgetList()
  const hasWidgets = widgetNames.length > 0

  const chatMode = !hasWidgets ? 'solo' : chatCollapsed || !canFitSidebar ? 'floating' : 'sidebar'

  const handleModeChange = canFitSidebar
    ? (mode: 'sidebar' | 'floating') => setChatCollapsed(mode === 'floating')
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
      onCollapse={() => setChatCollapsed(true)}
    />
  )

  const showSidebar = chatMode === 'sidebar'

  return (
    <div className="min-h-screen p-8 max-lg:px-6 max-lg:py-6 max-sm:px-4 max-sm:py-4">
      <div
        className={cn(
          'mx-auto flex w-full max-w-[1184px] justify-center',
          'min-h-[calc(100vh-4rem) max-lg:min-h-[calc(100vh-3rem)] max-sm:min-h-[calc(100vh-2rem)]'
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
        <ChatPopup defaultOpen={chatCollapsed}>
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
