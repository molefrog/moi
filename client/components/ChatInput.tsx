import { useRef } from 'react'

import { IconArrowUp, IconPlayerStop } from '@tabler/icons-react'

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
      className="shadow-xs flex w-full cursor-text flex-col gap-1 rounded-lg bg-white p-2 outline-none transition-[color,box-shadow] focus-within:shadow-sm"
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
        placeholder="Ask anything..."
        disabled={processing}
        autoFocus
        rows={1}
        className="field-sizing-content placeholder:text-muted-foreground max-h-40 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none disabled:opacity-50"
      />
      <div className="flex justify-end">
        {processing ? (
          <Button type="button" size="icon" onClick={onStop} aria-label="Stop agent">
            <IconPlayerStop stroke={1.5} />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!value.trim()} aria-label="Send message">
            <IconArrowUp stroke={1.5} />
          </Button>
        )}
      </div>
    </form>
  )
}
