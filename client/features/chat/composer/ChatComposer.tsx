import { type RefObject, useRef, useState } from 'react'

import {
  IconFile,
  IconLoader2,
  IconPaperclip,
  IconPlayerStopFilled,
  IconScribble,
  IconX
} from '@tabler/icons-react'

import {
  canSubmitComposerAction,
  type ComposerAvailability,
  Composer,
  ComposerFooter,
  ComposerSubmitButton,
  ComposerTextarea
} from '@/client/components/shared/Composer'
import { Button } from '@/client/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/client/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { stageComposerFiles } from '@/client/features/chat/attachment-staging'
import { cn } from '@/client/lib/cn'
import { useWorkspaceId } from '@/client/features/workspace/WorkspaceContext'
import {
  type ChatAttachment,
  attachmentKey,
  liveStore,
  useLive
} from '@/client/features/chat/chat-store'
import { useUiStore } from '@/client/store/ui'

import { ModelPicker } from './ModelPicker'

export type ComposerAnnotationControls = {
  active: boolean
  finish: () => Promise<void>
  onToggle: () => void
  onRemove: (localId: string) => void
}

type ChatComposerDraft = {
  value: string
  onChange: (value: string) => void
}

type ChatComposerProps = {
  composerRef: RefObject<HTMLTextAreaElement | null>
  onSend: (text: string) => void | Promise<void>
  onStop: () => void
  processing: boolean
  sessionId: string | null
  modelSessionId: string | null
  availability: ComposerAvailability
  annotation?: ComposerAnnotationControls
  onRemoveDrawing?: (localId: string) => void
  allowFiles?: boolean
  placeholder?: string
  draft?: ChatComposerDraft
}

// Draft text is persisted per workspace, while attachments remain ephemeral and
// follow the selected chat. Both stores are subscribed here so a keystroke or
// upload re-renders only the composer.
export function ChatComposer({
  composerRef,
  onSend,
  onStop,
  processing,
  sessionId,
  modelSessionId,
  availability,
  annotation,
  onRemoveDrawing,
  allowFiles = true,
  placeholder,
  draft
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const workspaceId = useWorkspaceId()
  const workspaceDraft = useUiStore(s => s.composerDrafts[workspaceId] ?? '')
  const value = draft?.value ?? workspaceDraft
  const valueRef = useRef(value)
  valueRef.current = value
  const attachments = useLive(s => s.attachments[attachmentKey(workspaceId, sessionId)] ?? EMPTY)
  const [dragOver, setDragOver] = useState(false)

  const uploading = attachments.some(a => a.status === 'uploading')
  // A draft annotation counts as sendable content: send() finishes the drawing
  // first, which uploads it before the message goes out.
  const hasSendable = attachments.some(a => a.status === 'ready' || a.status === 'draft')
  const hasContent = value.trim().length > 0 || hasSendable
  const canSend = canSubmitComposerAction(hasContent, uploading, availability)

  const onChange = (next: string) => {
    valueRef.current = next
    if (draft) draft.onChange(next)
    else useUiStore.getState().setComposerDraft(workspaceId, next)
  }

  const addFiles = (files: File[]) => {
    if (allowFiles) stageComposerFiles({ workspaceId, sessionId }, files)
  }

  // Guards the await window while an annotation finishes: no re-entry from a
  // second Enter, and the draft is re-read afterwards so text typed during the
  // upload isn't lost.
  const sendingRef = useRef(false)

  const removeAttachment = (attachment: ChatAttachment) => {
    if (attachment.kind === 'drawing' && onRemoveDrawing) {
      onRemoveDrawing(attachment.localId)
      return
    }
    liveStore.getState().removeAttachment(workspaceId, sessionId, attachment.localId)
  }

  const send = async () => {
    if (!canSend || sendingRef.current) return
    sendingRef.current = true
    try {
      await annotation?.finish()
      await onSend(valueRef.current)
      if (!draft) {
        valueRef.current = ''
        useUiStore.getState().setComposerDraft(workspaceId, '')
      }
    } finally {
      sendingRef.current = false
    }
  }

  return (
    <Composer
      composerRef={composerRef}
      onSubmit={e => {
        e.preventDefault()
        void send()
      }}
      onDragOver={e => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        if (allowFiles) setDragOver(true)
      }}
      onDragLeave={e => {
        if (!allowFiles) return
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
        <div className="flex flex-wrap gap-2 px-1 pt-1 pb-1">
          {attachments.map(a => (
            <AttachmentChip key={a.localId} attachment={a} onRemove={() => removeAttachment(a)} />
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
            void send()
          }
        }}
        onPaste={e => {
          const files = Array.from(e.clipboardData?.files ?? [])
          if (files.length === 0) return
          e.preventDefault()
          addFiles(files)
        }}
        placeholder={processing ? 'Queue a follow-up' : (placeholder ?? 'Do anything')}
        rows={1}
      />
      <ComposerFooter>
        {allowFiles && (
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
        )}
        <div className="mr-auto flex shrink-0 items-center gap-0.5">
          {allowFiles && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => fileRef.current?.click()}
                    aria-label="Attach files"
                  >
                    {/* Paperclip is too heavy compared to the nearby scribble icon */}
                    <IconPaperclip stroke={1.6} className="size-4.5!" />
                  </Button>
                }
              />
              <TooltipContent>Attach files</TooltipContent>
            </Tooltip>
          )}
          {annotation && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={annotation.onToggle}
                    className={cn(annotation.active && 'bg-accent')}
                    aria-label="Draw annotation"
                    aria-pressed={annotation.active}
                  >
                    <IconScribble stroke={1.5} />
                  </Button>
                }
              />
              <TooltipContent>Draw annotation</TooltipContent>
            </Tooltip>
          )}
        </div>
        <ModelPicker sessionId={modelSessionId} />
        {processing ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="button" size="icon" onClick={onStop} aria-label="Stop agent">
                  <IconPlayerStopFilled />
                </Button>
              }
            />
            <TooltipContent>Stop answering</TooltipContent>
          </Tooltip>
        ) : (
          <ComposerSubmitButton
            label="Send message"
            hasContent={hasContent}
            busy={uploading}
            availability={availability}
          />
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
  if (attachment.kind === 'drawing') {
    return <DrawingAttachmentChip attachment={attachment} onRemove={onRemove} />
  }

  const { name, previewUrl, status, error } = attachment
  const isImage = !!previewUrl

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 overflow-hidden rounded-lg bg-accent text-accent-foreground ring-1 ring-border',
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

type DrawingAttachmentChipProps = {
  attachment: Extract<ChatAttachment, { kind: 'drawing' }>
  onRemove: () => void
}

function DrawingAttachmentChip({ attachment, onRemove }: DrawingAttachmentChipProps) {
  const { previewUrl, purpose } = attachment
  const label = purpose === 'sketch' ? 'Sketch' : 'Annotation'

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <div
            tabIndex={0}
            className="group flex h-7 cursor-default items-center rounded-md bg-background pr-2 pl-0.5 text-sm whitespace-nowrap text-foreground ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Remove ${label.toLowerCase()}`}
          className="size-6 shrink-0 hover:bg-transparent hover:text-current"
        >
          <IconScribble stroke={1.75} className="group-focus-within:hidden group-hover:hidden" />
          <IconX stroke={1.75} className="hidden group-focus-within:block group-hover:block" />
        </Button>
        <span>{label}</span>
      </HoverCardTrigger>
      {previewUrl && (
        <HoverCardContent side="top" align="start" className="w-60 max-w-[calc(100vw-2rem)]">
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="max-h-72 w-full rounded-md object-contain"
          />
        </HoverCardContent>
      )}
    </HoverCard>
  )
}
