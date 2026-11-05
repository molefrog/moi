// What a visual test opens, with no moi server behind it:
// - `/#/settings`, any app route: the real app, with client/main.tsx's
//   providers; the test answers its /api calls (fixtures.ts).
// - `/#ui/<registry name>`: one design-system preview alone on a blank canvas.
import '@/client/structured-clone-shim'
import 'blobatar/motion.css'
import '@/client/index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { loadAppConfig } from '@/client/api/app-config'
import { AppProvider } from '@/client/app/app-provider'
import { AppRouter } from '@/client/app/app-router'
import { Toaster } from '@/client/components/ui/toast'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { AccountProvider } from '@/client/features/account/account-provider'
import { initConnection } from '@/client/features/chat/connection/chat-connection'
import { setLocalUser } from '@/client/features/collab/host-state'
import { UI_COMPONENT_PREVIEWS } from '@/client/features/dev/ui-components/ui-component-previews'

const target = decodeURIComponent(location.hash.slice(1))
const root = document.getElementById('root')
if (!root) throw new Error('#root is missing')

if (target.startsWith('ui/')) {
  const Preview = UI_COMPONENT_PREVIEWS[target.slice(3) as keyof typeof UI_COMPONENT_PREVIEWS]
  createRoot(root).render(
    // An applet frame, as in the app: overlays like the drawer open inside the
    // nearest [data-applet].
    <main
      data-applet="dev:ui-components"
      className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-muted p-10 font-sans text-foreground"
    >
      {Preview ? <Preview /> : <p>No preview named {JSON.stringify(target)}</p>}
    </main>
  )
} else {
  const queryClient = new QueryClient()
  initConnection(queryClient)
  await loadAppConfig()
  // client/index.tsx makes a random local user on first run; a fixed one keeps
  // the captures the same.
  setLocalUser({ id: 'local-mole', name: 'Mole', color: 'blue' })
  const { hook } = memoryLocation({ path: target || '/' })
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <Router hook={hook}>
            <AccountProvider>
              <AppRouter />
            </AccountProvider>
          </Router>
          <Toaster />
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  )
}
