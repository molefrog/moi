import { type RefObject, useRef, useState } from 'react'

import {
  IconArrowUp,
  IconFile,
  IconLoader2,
  IconPaperclip,
  IconPlayerStop,
  IconX
} from '@tabler/icons-react'

import { Composer, ComposerFooter, ComposerTextarea } from '@/client/components/shared/Composer'
import { cn } from '@/client/lib/cn'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import { uploadFiles } from '@/client/features/chat/uploads'
import {
  type ChatAttachment,
  draftKey,
  liveStore,
  useLive
} from '@/client/features/chat/chat-store'

import { ModelPicker } from './ModelPicker'
import { Button } from '@/client/components/ui/button'

type ChatComposerProps = {
  composerRef: RefObject<HTMLTextAreaElement | null>
  onSend: (text: string) => void
  onStop: () => void
  processing: boolean
}

// The composer owns the draft: it reads/writes the per-thread draft in the live
// store directly, so a keystroke re-renders only this component — not the chat
// panel, message list, or surrounding workspace. The draft is keyed by the
// active thread, so switching threads swaps the unsent text with you. Attachments
// (drag/drop, paste, attach button) are tracked the same way and cleared on send.
export function ChatComposer({ composerRef, onSend, onStop, processing }: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const workspaceId = useWorkspaceId()
  const sessionId = useLive(s => s.activeByWorkspace[workspaceId] ?? null)
  const value = useLive(s => s.drafts[draftKey(workspaceId, sessionId)] ?? '')
  const attachments = useLive(s => s.attachments[draftKey(workspaceId, sessionId)] ?? EMPTY)
  const [dragOver, setDragOver] = useState(false)

  const uploading = attachments.some(a => a.status === 'uploading')
  const hasReady = attachments.some(a => a.status === 'ready')
  const canSend = (value.trim().length > 0 || hasReady) && !uploading

  const onChange = (next: string) => liveStore.getState().setDraft(workspaceId, sessionId, next)

  // Upload each picked file immediately, tracking its in-flight status so the
  // thumbnail row can show a spinner / error per file.
  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    const store = liveStore.getState()
    const items: ChatAttachment[] = files.map(f => ({
      localId: crypto.randomUUID(),
      name: f.name || 'file',
      mediaType: f.type || 'application/octet-stream',
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      status: 'uploading'
    }))
    store.addAttachments(workspaceId, sessionId, items)
    items.forEach((item, i) => {
      uploadFiles(workspaceId, [files[i]])
        .then(([info]) =>
          liveStore.getState().updateAttachment(workspaceId, sessionId, item.localId, {
            status: 'ready',
            upload: info,
            mediaType: info.mediaType
          })
        )
        .catch((err: unknown) =>
          liveStore.getState().updateAttachment(workspaceId, sessionId, item.localId, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Upload failed'
          })
        )
    })
  }

  const send = () => {
    if (!canSend) return
    onSend(value)
    // Clear under the current key. On a new chat `sessionId` is still null, so
    // this clears the `'new'` draft; `send` then mints the real id and the input
    // re-renders empty under the new key. (Attachments are cleared by `send`.)
    liveStore.getState().setDraft(workspaceId, sessionId, '')
  }

  return (
    <Composer
      composerRef={composerRef}
      onSubmit={e => {
        e.preventDefault()
        send()
      }}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={e => {
        // Ignore leaves into child elements — only reset when leaving the form.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragOver(false)
      }}
      onDrop={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragOver(false)
        addFiles(Array.from(e.dataTransfer.files))
      }}
      className={cn(dragOver && 'ring-2 ring-ring/60')}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1 pt-1 pb-0.5">
          {attachments.map(a => (
            <AttachmentChip
              key={a.localId}
              attachment={a}
              onRemove={() =>
                liveStore.getState().removeAttachment(workspaceId, sessionId, a.localId)
              }
            />
          ))}
        </div>
      )}

      <ComposerTextarea
        textareaRef={composerRef}
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
        onPaste={e => {
          const files = Array.from(e.clipboardData?.files ?? [])
          if (files.length === 0) return
          e.preventDefault()
          addFiles(files)
        }}
        placeholder={processing ? 'Queue a follow-up' : 'Do anything'}
        rows={1}
      />
      <ComposerFooter>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={e => {
            addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mr-auto"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach files"
        >
          <IconPaperclip stroke={1.5} />
        </Button>
        <ModelPicker />
        {processing ? (
          <Button type="button" size="icon" onClick={onStop} aria-label="Stop agent">
            <IconPlayerStop stroke={1.5} />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!canSend} aria-label="Send message">
            <IconArrowUp stroke={1.5} />
          </Button>
        )}
      </ComposerFooter>
    </Composer>
  )
}

const EMPTY: ChatAttachment[] = []

type AttachmentChipProps = {
  attachment: ChatAttachment
  onRemove: () => void
}

// A composer attachment preview: an image thumbnail or a labelled file chip,
// with an upload spinner / error overlay and a remove button.
function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const { name, previewUrl, status, error } = attachment
  const isImage = !!previewUrl

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 overflow-hidden rounded-md border border-border bg-accent text-accent-foreground',
        isImage ? 'size-14' : 'h-10 max-w-52 pr-2 pl-2',
        status === 'error' && 'border-destructive/50'
      )}
      title={error ?? name}
    >
      {isImage ? (
        <img src={previewUrl} alt={name} className="size-full object-cover" />
      ) : (
        <>
          <IconFile size={16} stroke={1.75} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-xs">{name}</span>
        </>
      )}

      {status === 'uploading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <IconLoader2 size={16} stroke={1.75} className="animate-spin text-muted-foreground" />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 text-[10px] text-destructive">
          Failed
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="absolute top-0.5 right-0.5 size-4 rounded-full bg-primary/70 text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary/80 [&_svg]:size-3"
      >
        <IconX stroke={1.75} />
      </Button>
    </div>
  )
}
