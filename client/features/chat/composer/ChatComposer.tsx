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
import type { ChatAnnotationControls } from '@/client/features/annotations/types'
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

import { ModelPicker } from '../ModelPicker'

type ChatComposerProps = {
  composerRef: RefObject<HTMLTextAreaElement | null>
  onSend: (text: string) => void
  onStop: () => void
  processing: boolean
  sessionId: string | null
  availability: ComposerAvailability
  annotation?: ChatAnnotationControls
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
  availability,
  annotation
}: ChatComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const workspaceId = useWorkspaceId()
  const value = useUiStore(s => s.composerDrafts[workspaceId] ?? '')
  const attachments = useLive(s => s.attachments[attachmentKey(workspaceId, sessionId)] ?? EMPTY)
  const [dragOver, setDragOver] = useState(false)

  const uploading = attachments.some(a => a.status === 'uploading')
  const hasReady = attachments.some(a => a.status === 'ready')
  const hasContent = value.trim().length > 0 || hasReady
  const canSend = canSubmitComposerAction(hasContent, uploading, availability)

  const onChange = (next: string) => useUiStore.getState().setComposerDraft(workspaceId, next)

  const addFiles = (files: File[]) => stageComposerFiles({ workspaceId, sessionId }, files)

  const send = () => {
    if (!canSend) return
    if (annotation?.active) annotation.finish()
    onSend(value)
    useUiStore.getState().setComposerDraft(workspaceId, '')
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
              onRemove={() => {
                if (a.kind === 'annotation') annotation?.onRemove(a.localId)
                liveStore.getState().removeAttachment(workspaceId, sessionId, a.localId)
              }}
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
        <div className="mr-auto flex items-center gap-0.5">
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
                  <IconPaperclip stroke={1.5} />
                </Button>
              }
            />
            <TooltipContent>Attach files</TooltipContent>
          </Tooltip>
          {annotation && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant={annotation.active ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={annotation.onToggle}
                    aria-label={annotation.active ? 'Finish annotation' : 'Draw annotation'}
                    aria-pressed={annotation.active}
                  >
                    <IconScribble stroke={1.5} />
                  </Button>
                }
              />
              <TooltipContent>
                {annotation.active ? 'Finish annotation' : 'Draw annotation'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <ModelPicker />
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
  if (attachment.kind === 'annotation') {
    return <AnnotationAttachmentChip attachment={attachment} onRemove={onRemove} />
  }

  const { name, previewUrl, status, error } = attachment
  const isImage = !!previewUrl

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-accent text-accent-foreground',
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

type AnnotationAttachmentChipProps = {
  attachment: Extract<ChatAttachment, { kind: 'annotation' }>
  onRemove: () => void
}

function AnnotationAttachmentChip({ attachment, onRemove }: AnnotationAttachmentChipProps) {
  const { previewUrl, status, error } = attachment
  return (
    <div className="group relative">
      <HoverCard>
        <HoverCardTrigger
          render={
            <Button
              type="button"
              variant={status === 'error' ? 'destructive' : 'secondary'}
              size="sm"
              title={error ?? 'Annotation'}
              className="pr-8"
            />
          }
        >
          {status === 'uploading' ? (
            <IconLoader2 className="animate-spin" stroke={1.75} />
          ) : (
            <IconScribble stroke={1.75} />
          )}
          <span>{status === 'error' ? 'Annotation failed' : 'Annotation'}</span>
        </HoverCardTrigger>
        {previewUrl && (
          <HoverCardContent side="top" align="start" className="w-80 max-w-[calc(100vw-2rem)]">
            <img
              src={previewUrl}
              alt="Annotation preview"
              className="max-h-72 w-full rounded-lg object-contain"
            />
          </HoverCardContent>
        )}
      </HoverCard>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remove annotation"
        className="absolute top-1/2 right-1 size-6 -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <IconX stroke={1.75} />
      </Button>
    </div>
  )
}
