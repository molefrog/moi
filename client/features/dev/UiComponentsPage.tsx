import { useState } from 'react'

import { Link } from 'wouter'

import { Button } from '@/client/components/ui/button'
import registry from '@/registry.json'
import { UI_COMPONENT_PREVIEWS } from './UiComponentPreviews'

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
            Interactive previews for registry components.
          </p>
        </header>

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside
            aria-label="UI components"
            className="flex h-[min(42rem,70dvh)] flex-col gap-1 overflow-y-auto"
          >
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
            className="relative isolate flex h-[min(42rem,70dvh)] min-h-96 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-muted p-6 shadow-sm sm:p-10"
          >
            {Preview && <Preview key={selectedName} />}
          </section>
        </div>
      </div>
    </main>
  )
}
