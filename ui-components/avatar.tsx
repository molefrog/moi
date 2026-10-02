import * as React from 'react'
import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'
import { cn } from './utils'

function Avatar({
  className,
  size = 'default',
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: 'default' | 'sm' | 'lg' | 'xs'
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        'group/avatar relative isolate flex shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=default]:size-8 data-[size=lg]:size-10 data-[size=sm]:size-6 data-[size=xs]:size-5 dark:after:mix-blend-lighten',
        '[--avatar-badge-size:--spacing(2.5)] data-[size=sm]:[--avatar-badge-size:--spacing(2)] data-[size=xs]:[--avatar-badge-size:--spacing(1.5)]',
        // Cut a transparent gap around the badge in the face and its outline.
        'has-[>[data-slot=avatar-badge]]:[&::after,&>:where([data-slot=avatar-image],[data-slot=avatar-fallback])]:mask-[radial-gradient(circle_at_calc(100%_-_var(--avatar-badge-size)/2)_calc(100%_-_var(--avatar-badge-size)/2),transparent_calc(var(--avatar-badge-size)/2_+_2px),black_calc(var(--avatar-badge-size)/2_+_2.5px))]',
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full rounded-full object-cover', className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center overflow-hidden rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs group-data-[size=xs]/avatar:text-xs',
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: Omit<React.ComponentProps<'span'>, 'children'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute right-0 bottom-0 size-(--avatar-badge-size) rounded-full bg-primary select-none',
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group flex items-center -space-x-2 [--avatar-radius:--spacing(4)]',
        '*:data-[size=lg]:[--avatar-radius:--spacing(5)] *:data-[size=sm]:[--avatar-radius:--spacing(3)] *:data-[size=xs]:[--avatar-radius:--spacing(2.5)]',
        // Leave a transparent gap around the previous avatar, including on an overflow count.
        '[&>:is([data-slot=avatar],[data-slot=avatar-group-count]):not(:first-child)]:mask-[radial-gradient(circle_at_calc(--spacing(2)_-_var(--avatar-radius))_50%,transparent_calc(var(--avatar-radius)_+_2px),black_calc(var(--avatar-radius)_+_2.5px))]',
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & {
  size?: React.ComponentProps<typeof Avatar>['size']
}) {
  return (
    <div
      data-slot="avatar-group-count"
      data-size={size}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full bg-accent text-sm text-muted-foreground [&>svg]:size-4',
        'data-[size=default]:size-8 data-[size=lg]:size-10 data-[size=sm]:size-6 data-[size=xs]:size-5',
        'data-[size=sm]:text-[11px] data-[size=xs]:text-[11px]',
        'data-[size=lg]:[&>svg]:size-5 data-[size=sm]:[&>svg]:size-3 data-[size=xs]:[&>svg]:size-3',
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
