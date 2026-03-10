import React, { useCallback, useEffect, useRef, useState } from 'react'

import { createRoot } from 'react-dom/client'

import './app.css'
import { ChatPanel } from './components/ChatPanel'
import { cn } from './shared/cn'
import { ChatPopup } from './components/ChatPopup'
import { Workspace } from './components/Workspace'
import type { ChatMessage } from './shared/types'

type Message = ChatMessage

const MESSAGE_THRESHOLD = 5
const SPLIT_MIN_WIDTH = 1184 // 40 + 640 + 64 + 400 + 40

function useCanFitSidebar() {
  const [fits, setFits] = useState(() => window.innerWidth >= SPLIT_MIN_WIDTH)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${SPLIT_MIN_WIDTH}px)`)
    const handler = (e: MediaQueryListEvent) => setFits(e.matches)
    mq.addEventListener('change', handler)
    setFits(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return fits
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const canFitSidebar = useCanFitSidebar()

  const layoutMode =
    messages.length < MESSAGE_THRESHOLD
      ? 'centered'
      : chatCollapsed || !canFitSidebar
        ? 'popup'
        : 'sidebar'

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`)
    wsRef.current = ws

    ws.onmessage = e => {
      const data = JSON.parse(e.data)
      if (data.type === 'status') {
        setProcessing(data.processing)
        return
      }
      if (data.type === 'history') {
        setMessages(data.messages)
        return
      }
      setMessages(prev => [...prev, data])
    }

    ws.onclose = () => {
      setTimeout(() => location.reload(), 2000)
    }

    return () => ws.close()
  }, [])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || !wsRef.current || processing) return
    wsRef.current.send(JSON.stringify({ type: 'chat', content: text }))
    setInput('')
  }, [input, processing])

  const stop = useCallback(() => {
    if (!wsRef.current || !processing) return
    wsRef.current.send(JSON.stringify({ type: 'stop' }))
  }, [processing])

  const chatPanel = (
    <ChatPanel
      messages={messages}
      input={input}
      setInput={setInput}
      processing={processing}
      send={send}
      stop={stop}
      layoutMode={layoutMode}
      onCollapse={() => setChatCollapsed(true)}
      onExpand={() => setChatCollapsed(false)}
    />
  )

  if (layoutMode === 'centered') {
    return <div className="h-screen">{chatPanel}</div>
  }

  const showSidebar = layoutMode === 'sidebar'

  return (
    <div className="flex h-screen items-start justify-center p-10">
      {/* Workspace always visible in sidebar/popup modes */}
      <div className="w-full max-w-[640px]">
        <Workspace />
      </div>

      {/* Sidebar chat — always in DOM, width animates to push workspace */}
      <div
        className={cn(
          'h-full shrink-0 overflow-hidden transition-all ease-in-out',
          showSidebar
            ? 'w-[464px] opacity-100 duration-0'
            : 'w-0 opacity-0 duration-200'
        )}
      >
        <div className="h-full w-[464px] pl-16">
          {chatPanel}
        </div>
      </div>

      {/* Popup chat */}
      {layoutMode === 'popup' && (
        <ChatPopup>
          {onClose => (
            <ChatPanel
              messages={messages}
              input={input}
              setInput={setInput}
              processing={processing}
              send={send}
              stop={stop}
              layoutMode={layoutMode}
              onCollapse={() => setChatCollapsed(true)}
              onExpand={() => setChatCollapsed(false)}
              onClose={onClose}
            />
          )}
        </ChatPopup>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
