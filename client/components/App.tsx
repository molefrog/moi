import { useState } from 'react'

import { useCanFitSidebar } from '@/client/hooks/useCanFitSidebar'
import { useChat } from '@/client/hooks/useChat'
import { cn } from '@/client/lib/cn'

import { ChatPanel } from './ChatPanel'
import { ChatPopup } from './ChatPopup'
import { Widgets } from './Widgets'

const MESSAGE_THRESHOLD = 5

export function App() {
  const { messages, input, setInput, processing, send, stop } = useChat()
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const canFitSidebar = useCanFitSidebar()

  const chatMode =
    messages.length < MESSAGE_THRESHOLD
      ? 'solo'
      : chatCollapsed || !canFitSidebar
        ? 'floating'
        : 'sidebar'

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
    <div className="min-h-screen px-4 py-4 sm:px-6 sm:py-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1184px] justify-center sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-4rem)]">
        <div className="max-w-160 flex w-full min-w-0 flex-1 flex-col">
          {chatMode === 'solo' ? chatPanel : <Widgets />}
        </div>

        {canFitSidebar && chatMode !== 'solo' && (
          <div
            className={cn(
              'sticky top-10 h-[calc(100vh-4rem)] shrink-0 self-start transition-all ease-in-out',
              showSidebar ? 'w-[464px] opacity-100 duration-200' : 'w-0 opacity-0 duration-200'
            )}
          >
            <div className="h-full w-[464px] pl-6 lg:pl-16">{chatPanel}</div>
          </div>
        )}
      </div>

      {chatMode === 'floating' && (
        <ChatPopup>
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
