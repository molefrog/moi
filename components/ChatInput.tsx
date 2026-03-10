import React, { useEffect, useRef } from 'react'

import { ArrowUp } from '@untitledui/icons'

import { Button } from './ui/button'

type ChatInputProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  processing: boolean
}

export function ChatInput({ value, onChange, onSend, onStop, processing }: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 160) + 'px'
    }
  }, [value])

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        onSend()
      }}
      onMouseDown={e => {
        if (e.target instanceof HTMLElement && e.target.closest('button')) return
        e.preventDefault()
        ref.current?.focus()
      }}
      className="border-input focus-within:border-ring focus-within:ring-ring/50 flex w-full cursor-text flex-col gap-1 rounded-xl border bg-transparent p-2 shadow-xs transition-[color,box-shadow] outline-none focus-within:ring-[3px]"
    >
      <textarea
        ref={ref}
        id="chat-input"
        name="message"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder="Ask the agent..."
        disabled={processing}
        autoFocus
        rows={1}
        className="placeholder:text-muted-foreground w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none disabled:opacity-50"
      />
      <div className="flex justify-end pt-0">
        {processing ? (
          <Button type="button" size="icon" onClick={onStop} aria-label="Stop agent">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="1.5" />
            </svg>
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!value.trim()} aria-label="Send message">
            <ArrowUp />
          </Button>
        )}
      </div>
    </form>
  )
}
