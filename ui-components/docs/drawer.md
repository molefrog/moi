---
title: Drawer
description: A side panel scoped to the current moi view.
---

## Add

```sh
moi ui-components add drawer
```

Drawer is available to views only.

## Usage

```tsx
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

export function Example() {
  return (
    <Drawer>
      <DrawerTrigger render={<Button variant="outline" />}>Details</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Order details</DrawerTitle>
          <DrawerDescription>Placed two days ago</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>...</DrawerBody>
        <DrawerFooter>
          <DrawerClose render={<Button />}>Done</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
```

It opens from the right and uses `modal="trap-focus"` by default. Pass `modal={true}` for a backdrop and full modal behavior. Put growing content in `DrawerBody`.

Every `DrawerContent` needs a `DrawerTitle`; use `className="sr-only"` to hide it visually. The built-in close button can be disabled with `showCloseButton={false}`. Other Base UI Drawer props, including `swipeDirection` and snap points, pass through.
