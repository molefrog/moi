// The moi-authored `drawer` ui component: source and docs for the catalog
// entry in ./ui-components.ts. Embedded as strings like the other workspace
// templates (APPLET_PORTAL_SOURCE, moi-scaffold.ts): the file belongs to the
// workspace once written, not to moi's bundle.
//
// Why moi-authored: the upstream registry's `sheet` and `drawer` overlay the
// whole page (`position: fixed`, portalled to <body>), which is page chrome the
// curated set deliberately leaves out. Inside an applet the same job — a
// detail pane, a filter sheet — must stay within the widget card or the view,
// with the rest of the workspace still usable. So this one is written for the
// applet: it portals into the nearest `[data-applet]` root (the host keeps that
// element a positioned, non-scrolling box — AppletMount and ViewFrame) and
// positions against it, uses Base UI's `trap-focus` mode instead of a
// page-modal one, and animates with the same tw-animate-css vocabulary the
// registry components compile against.
//
// The source is already in workspace form — relative imports, Tabler icons, no
// portal codemod needed — so `add` writes it verbatim (see `verbatim` in
// ./ui-components.ts). Keep it a plain string: no template expressions, so the
// file stays greppable and the test suite can assert on it.
export const DRAWER_SOURCE = `"use client"

// moi drawer — a slide-in panel scoped to the view it is used in.
//
// A dialog's overlay covers the whole page; the drawer covers only the view it
// belongs to. Its backdrop dims that area alone, and the rest of the workspace
// — chat, tabs, widgets — stays visible and usable. It opens from the right by
// default. Views only: a widget card has no room for a panel, and \`moi bundle\`
// refuses a widget that imports this file. Built on Base UI's Dialog, so focus
// trapping, Escape, backdrop press, and accessible naming come for free.
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
import * as React from "react"
import { Dialog as DrawerPrimitive } from "@base-ui/react/dialog"
import { IconX } from "@tabler/icons-react"

import { cn } from "./utils"

// \`trap-focus\` keeps keyboard focus inside the open drawer without locking
// page scroll or blocking pointer interaction with the rest of the workspace —
// the point of an applet-scoped overlay. Pass \`modal={false}\` for a panel the
// user can tab out of.
function Drawer({ modal = "trap-focus", ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" modal={modal} {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

type DrawerSide = "top" | "right" | "bottom" | "left"

const SIDE_CLASSES: Record<DrawerSide, string> = {
  right:
    "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l data-open:slide-in-from-right data-closed:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r data-open:slide-in-from-left data-closed:slide-out-to-left",
  top: "inset-x-0 top-0 max-h-3/4 border-b data-open:slide-in-from-top data-closed:slide-out-to-top",
  bottom:
    "inset-x-0 bottom-0 max-h-3/4 border-t data-open:slide-in-from-bottom data-closed:slide-out-to-bottom"
}

type DrawerContentProps = DrawerPrimitive.Popup.Props & {
  // The edge of the view the panel slides in from; right by default.
  side?: DrawerSide
  showCloseButton?: boolean
}

function DrawerContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: DrawerContentProps) {
  // The panel renders into the view's root element instead of <body>, so it
  // can only ever cover the view. The hidden marker finds that root from where
  // the drawer is used; until it has, the portal renders nothing (Base UI
  // waits on a \`null\` container instead of falling back to body).
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  const marker = React.useCallback((node: HTMLElement | null) => {
    if (node) setContainer(node.closest<HTMLElement>("[data-applet]") ?? node.parentElement)
  }, [])

  return (
    <>
      <span hidden ref={marker} />
      <DrawerPrimitive.Portal container={container}>
        {/* z-50 so the panel also covers view content that raised itself (a
            sticky table header with z-10); the view root is a stacking
            context, so nothing leaks past the view. */}
        <DrawerPrimitive.Backdrop
          data-slot="drawer-backdrop"
          className="absolute inset-0 z-50 bg-foreground/20 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        />
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          data-side={side}
          className={cn(
            "absolute z-50 flex flex-col gap-4 overflow-y-auto bg-popover text-sm text-popover-foreground shadow-lg outline-hidden duration-200 ease-in-out data-open:animate-in data-closed:animate-out",
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

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="drawer-header" className={cn("flex flex-col gap-0.5 p-4 pr-12", className)} {...props} />
  )
}

// The scrolling region: a view shares the screen with the chat, so put
// anything that can grow here and the header and footer stay put while it
// scrolls.
function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-4", className)}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="drawer-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  )
}

// The title inherits the popup's \`text-popover-foreground\` on purpose: text on
// the popover surface uses the popover pair, not the page foreground.
function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-base font-medium", className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
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
  DrawerTrigger,
}
`

// Printed by `moi ui-components docs drawer` in place of an upstream page.
export const DRAWER_DOCS = `# Drawer

A panel that slides in from the right over the view it is used in, and nothing else. The
backdrop dims only that area; chat, tabs, and widgets stay visible and usable. Use it for a
detail pane, a filter or settings sheet, or a short form that belongs to the view's task. For
something that must interrupt the whole workspace, use \`dialog\`.

Views only. A widget card has no room for a panel, so \`moi bundle\` fails a widget that imports
the drawer. From a widget, send the user to a view with \`focusTab\`, or use \`dialog\` or \`popover\`
for something small.

moi-authored — there is no upstream shadcn page for it. Base UI Dialog underneath, styled like
the shadcn sheet, portalled into the applet root instead of \`document.body\`.

## Anatomy

\`\`\`tsx
import { Button } from '../ui/button'
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '../ui/drawer'

<Drawer>
  <DrawerTrigger render={<Button variant="outline" />}>Details</DrawerTrigger>
  <DrawerContent side="right">
    <DrawerHeader>
      <DrawerTitle>Order o-1024</DrawerTitle>
      <DrawerDescription>Placed 2 days ago</DrawerDescription>
    </DrawerHeader>
    <DrawerBody>…anything that can grow scrolls here…</DrawerBody>
    <DrawerFooter>
      <DrawerClose render={<Button />}>Done</DrawerClose>
    </DrawerFooter>
  </DrawerContent>
</Drawer>
\`\`\`

- \`DrawerTitle\` is required (\`className="sr-only"\` hides it): it names the panel for assistive
  technology.
- Put growing content in \`DrawerBody\`. It is the scroll region, so the header, footer, and close
  button stay put. A view shares the screen with the chat, so the panel is often narrow.
- Header and footer carry \`p-4\`; the body carries \`px-4\`. Give body content its own vertical
  spacing.

## Props

\`Drawer\` — Base UI \`Dialog.Root\` props: \`open\` / \`onOpenChange\` (controlled), \`defaultOpen\`,
\`onOpenChangeComplete\`, \`disablePointerDismissal\`, and \`modal\`. \`modal\` defaults to
\`"trap-focus"\`: focus stays inside the panel while the page keeps scrolling and stays clickable.
Pass \`modal={false}\` to let focus leave the panel.

\`DrawerContent\` — Base UI \`Dialog.Popup\` props plus:

- \`side\` — \`"right"\` (default), \`"left"\`, \`"top"\`, \`"bottom"\`. Left and right panels take 3/4 of
  the view width up to \`max-w-sm\`; top and bottom panels size to content up to 3/4 of the
  height. Right is the standard detail pane next to a table or list; reach for another side only
  when the layout calls for it.
- \`showCloseButton\` — the top-right X, default \`true\`.
- \`className\` — layout only: \`max-w-xs\` for a narrower panel, \`w-full max-w-none\` to cover the
  view.

\`DrawerTrigger\` / \`DrawerClose\` — Base UI \`Dialog.Trigger\` / \`Dialog.Close\`. Custom elements go
through the \`render\` prop, never by wrapping.

## Controlled

No trigger needed: open it from a row click, a chart segment, anything.

\`\`\`tsx
const [order, setOrder] = useState<Order | null>(null)

<Drawer open={order !== null} onOpenChange={open => { if (!open) setOrder(null) }}>
  <DrawerContent>
    <DrawerHeader>
      <DrawerTitle>{order?.id}</DrawerTitle>
    </DrawerHeader>
    <DrawerBody>…</DrawerBody>
  </DrawerContent>
</Drawer>
\`\`\`

## Fit

- Open it from the view's own content. Opened from inside a \`dialog\` it lands in the wrong place,
  because the dialog renders outside the view root.
- Escape, the backdrop, and \`DrawerClose\` close it. So does a click elsewhere in the workspace: it
  is not page-modal.
- One drawer open at a time per view; a second detail pane is a sign the view wants a master-detail
  layout instead.
`
