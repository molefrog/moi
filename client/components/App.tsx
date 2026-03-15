import { useState } from 'react'

import { Agentation } from 'agentation'

import { useCanFitSidebar } from '@/client/hooks/useCanFitSidebar'
import { useChat } from '@/client/hooks/useChat'
import { cn } from '@/client/lib/cn'

import { ChatPanel } from './ChatPanel'
import { ChatPopup } from './ChatPopup'
import { Workspace } from './Workspace'

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
    <>
      <div className="h-screen overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:p-10">
        <div className="mx-auto flex h-full w-full max-w-[1184px] justify-center">
          <div className="w-full max-w-160 min-w-0">
            {chatMode === 'solo' ? chatPanel : <Workspace />}
          </div>

          {canFitSidebar && chatMode !== 'solo' && (
            <div
              className={cn(
                'h-full shrink-0 transition-all ease-in-out',
                showSidebar ? 'w-[464px] opacity-100 duration-0' : 'w-0 opacity-0 duration-200'
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
      {process.env.NODE_ENV === 'development' && <Agentation />}
    </>
  )
}
