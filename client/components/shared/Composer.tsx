import type { ComponentProps, RefObject } from 'react'

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
        if (event.target instanceof HTMLElement && event.target.closest('button')) return
        event.preventDefault()
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
