import { useCallback, useEffect, useRef, useState } from 'react'

import type { ChatMessage } from '@/lib/types'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [processing, setProcessing] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

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

  return { messages, input, setInput, processing, send, stop }
}
