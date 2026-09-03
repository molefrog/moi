'use client'

// moi drawer — a slide-in panel scoped to the view it is used in.
//
// A dialog's overlay covers the whole page; the drawer covers only the view it
// belongs to. Its backdrop dims that area alone, and the rest of the workspace
// — chat, tabs, widgets — stays visible and usable. It opens from the right by
// default. Built on Base UI's Dialog, so focus trapping, Escape, backdrop
// press, and accessible naming come for free.
//
//   <Drawer>
//     <DrawerTrigger render={<Button variant="outline" />}>Details</DrawerTrigger>
//     <DrawerContent side="right">
//       <DrawerHeader>
//         <DrawerTitle>Order o-1024</DrawerTitle>
//         <DrawerDescription>Placed 2 days ago</DrawerDescription>
//       </DrawerHeader>
//       <DrawerBody>…</DrawerBody>
//       <DrawerFooter>
//         <DrawerClose render={<Button />}>Done</DrawerClose>
//       </DrawerFooter>
//     </DrawerContent>
//   </Drawer>
import * as React from 'react'
import { Dialog as DrawerPrimitive } from '@base-ui/react/dialog'
import { IconX } from '@tabler/icons-react'

import { cn } from './utils'

// `trap-focus` keeps keyboard focus inside the open drawer without locking
// page scroll or blocking pointer interaction with the rest of the workspace —
// the point of an applet-scoped overlay. Pass `modal={false}` for a panel the
// user can tab out of.
function Drawer({ modal = 'trap-focus', ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" modal={modal} {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

type DrawerSide = 'top' | 'right' | 'bottom' | 'left'

const SIDE_CLASSES: Record<DrawerSide, string> = {
  right:
    'inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-open:slide-in-from-right data-closed:slide-out-to-right',
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-open:slide-in-from-left data-closed:slide-out-to-left',
  top: 'inset-x-0 top-0 max-h-3/4 border-b data-open:slide-in-from-top data-closed:slide-out-to-top',
  bottom:
    'inset-x-0 bottom-0 max-h-3/4 border-t data-open:slide-in-from-bottom data-closed:slide-out-to-bottom'
}

type DrawerContentProps = DrawerPrimitive.Popup.Props & {
  // The edge of the view the panel slides in from; right by default.
  side?: DrawerSide
  showCloseButton?: boolean
}

function DrawerContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: DrawerContentProps) {
  // The panel renders into the view's root element instead of <body>, so it
  // can only ever cover the view. The hidden marker finds that root from where
  // the drawer is used; until it has, the portal renders nothing (Base UI
  // waits on a `null` container instead of falling back to body).
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  const marker = React.useCallback((node: HTMLElement | null) => {
    if (node) setContainer(node.closest<HTMLElement>('[data-applet]') ?? node.parentElement)
  }, [])

  return (
    <>
      <span hidden ref={marker} />
      <DrawerPrimitive.Portal container={container}>
        {/* z-50 so the panel also covers view content that raised itself (a
            sticky table header with z-10); the view root is a stacking
            context, so nothing leaks past the view. */}
        <DrawerPrimitive.Backdrop
          data-slot="drawer-overlay"
          className="absolute inset-0 z-50 bg-foreground/20 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          data-side={side}
          className={cn(
            'absolute z-50 flex flex-col gap-4 overflow-y-auto bg-popover text-sm text-popover-foreground shadow-lg outline-hidden duration-200 ease-in-out data-open:animate-in data-closed:animate-out',
            SIDE_CLASSES[side],
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DrawerPrimitive.Close
              data-slot="drawer-close"
              className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconX size={16} stroke={1.75} />
              <span className="sr-only">Close</span>
            </DrawerPrimitive.Close>
          )}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Portal>
    </>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex flex-col gap-0.5 p-4 pr-12', className)}
      {...props}
    />
  )
}

// The scrolling region: a view shares the screen with the chat, so put
// anything that can grow here and the header and footer stay put while it
// scrolls.
function DrawerBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-body"
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4', className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

// The title inherits the popup's `text-popover-foreground` on purpose: text on
// the popover surface uses the popover pair, not the page foreground.
function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-base font-medium', className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
}
