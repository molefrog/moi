import { useRef } from 'react'

import { IconArrowUp, IconPlayerStop } from '@tabler/icons-react'

import { useWorkspaceId } from '@/client/lib/WorkspaceContext'
import { draftKey, liveStore, useLive } from '@/client/store/live'

import { ModelPicker } from './ModelPicker'
import { Button } from './ui/button'

type ChatInputProps = {
  onSend: (text: string) => void
  onStop: () => void
  processing: boolean
}

// The composer owns the draft: it reads/writes the per-thread draft in the live
// store directly, so a keystroke re-renders only this component — not the chat
// panel, message list, or surrounding workspace. The draft is keyed by the
// active thread, so switching threads swaps the unsent text with you.
export function ChatInput({ onSend, onStop, processing }: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const workspaceId = useWorkspaceId()
  const sessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)
  const value = useLive(s => s.drafts[draftKey(workspaceId, sessionId)] ?? '')

  const onChange = (next: string) => liveStore.getState().setDraft(workspaceId, sessionId, next)
  const send = () => {
    onSend(value)
    // Clear under the current key. On a new chat `sessionId` is still null, so
    // this clears the `'new'` draft; `send` then mints the real id and the input
    // re-renders empty under the new key.
    liveStore.getState().setDraft(workspaceId, sessionId, '')
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        send()
      }}
      onMouseDown={e => {
        if (e.target instanceof HTMLElement && e.target.closest('button')) return
        e.preventDefault()
        ref.current?.focus()
      }}
      className="flex w-full cursor-text flex-col gap-1 rounded-lg bg-white p-2 shadow-xs transition-[color,box-shadow] outline-none focus-within:shadow-sm"
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
            send()
          }
        }}
        placeholder={processing ? 'Queue a follow-up...' : 'Ask anything...'}
        autoFocus
        rows={1}
        className="field-sizing-content max-h-40 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
      />
      <div className="flex items-center justify-end gap-1.5">
        <ModelPicker />
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
