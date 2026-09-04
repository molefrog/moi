import { useState } from 'react'

import { Link } from 'wouter'

import { Button } from '@/client/components/ui/button'
import registry from '@/registry.json'
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
} from '@/ui-components/drawer'

function ButtonPreview() {
  return <Button>Button</Button>
}

function DrawerPreview() {
  return (
    <Drawer>
      <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Drawer</DrawerTitle>
          <DrawerDescription>The component stays inside this view frame.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="flex flex-col gap-4">
            <section>
              <p className="text-sm font-medium">Order #1048</p>
              <p className="mt-1 text-sm text-muted-foreground">Desk lamp / Moss · 2 units</p>
            </section>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Customer</dt>
              <dd>Mira Chen</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>Picking</dd>
              <dt className="text-muted-foreground">Due</dt>
              <dd>Today, 16:30</dd>
            </dl>
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button>Mark packed</Button>
          <DrawerClose render={<Button variant="outline" />}>Close</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

export const UI_COMPONENT_PREVIEWS = {
  button: ButtonPreview,
  drawer: DrawerPreview
}

const registryItems = registry.items.filter(item => item.type === 'registry:ui')

export function UiComponentsPage() {
  const [selectedName, setSelectedName] = useState(registryItems[0]?.name ?? '')
  const Preview = UI_COMPONENT_PREVIEWS[selectedName as keyof typeof UI_COMPONENT_PREVIEWS]

  return (
    <main className="min-h-dvh bg-muted px-6 py-10 text-foreground">
      <div className="mx-auto w-full max-w-7xl">
        <Link href="/dev" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dev pages
        </Link>

        <header className="mt-5 max-w-2xl">
          <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Playground
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">UI components</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Interactive previews for every component in the local moi registry.
          </p>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside aria-label="UI components" className="flex flex-col gap-1">
            {registryItems.map(item => (
              <Button
                key={item.name}
                type="button"
                variant={item.name === selectedName ? 'secondary' : 'ghost'}
                className="justify-start"
                onClick={() => setSelectedName(item.name)}
              >
                {item.title}
              </Button>
            ))}
          </aside>

          <section
            data-applet="dev:ui-components"
            className="relative isolate flex h-[min(42rem,70dvh)] min-h-96 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-background p-6 shadow-sm sm:p-10"
          >
            {Preview && <Preview key={selectedName} />}
          </section>
        </div>
      </div>
    </main>
  )
}
