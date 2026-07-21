import type { ComponentProps, RefObject } from 'react'

import { IconArrowUp, IconLoader2 } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'

type ComposerProps = Omit<ComponentProps<'form'>, 'ref'> & {
  composerRef: RefObject<HTMLTextAreaElement | null>
}

export function Composer({
  composerRef,
  className,
  onMouseDown,
  children,
  ...props
}: ComposerProps) {
  return (
    <form
      {...props}
      onMouseDown={event => {
        onMouseDown?.(event)
        if (event.defaultPrevented) return
        if (
          event.target instanceof Element &&
          event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')
        )
          return
        composerRef.current?.focus()
      }}
      className={cn(
        'flex w-full max-w-(--chat-max-container) cursor-text flex-col gap-1 rounded-lg bg-card p-2 text-card-foreground shadow-xs transition-[color,box-shadow] outline-none focus-within:shadow-sm',
        className
      )}
    >
      {children}
    </form>
  )
}

type ComposerTextareaProps = Omit<ComponentProps<'textarea'>, 'ref'> & {
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function ComposerTextarea({ textareaRef, className, ...props }: ComposerTextareaProps) {
  return (
    <textarea
      {...props}
      ref={textareaRef}
      className={cn(
        'field-sizing-content max-h-40 w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50',
        className
      )}
    />
  )
}

type ComposerFooterProps = ComponentProps<'div'>

export function ComposerFooter({ className, children, ...props }: ComposerFooterProps) {
  return (
    <div {...props} className={cn('flex items-center justify-end gap-1.5', className)}>
      {children}
    </div>
  )
}

export function canSubmitComposerAction(
  hasContent: boolean,
  busy: boolean,
  unavailableReason: string | null | undefined
): boolean {
  return hasContent && !busy && unavailableReason === null
}

type ComposerSubmitButtonProps = {
  label: string
  hasContent: boolean
  busy?: boolean
  loading?: boolean
  unavailableReason: string | null | undefined
}

export function ComposerSubmitButton({
  label,
  hasContent,
  busy = false,
  loading = false,
  unavailableReason
}: ComposerSubmitButtonProps) {
  const canSubmit = canSubmitComposerAction(hasContent, busy || loading, unavailableReason)
  const button = (
    <Button type="submit" size="icon" disabled={!canSubmit} aria-label={label}>
      {loading ? (
        <IconLoader2 stroke={1.5} className="animate-spin" />
      ) : (
        <IconArrowUp stroke={1.5} />
      )}
    </Button>
  )

  if (loading || !unavailableReason) return button

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex">{button}</span>} />
      <TooltipContent className="max-w-64 text-center">{unavailableReason}</TooltipContent>
    </Tooltip>
  )
}
