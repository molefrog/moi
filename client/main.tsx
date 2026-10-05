import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'

import { Toaster } from '@/client/components/ui/toast'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { installAppletErrorHook } from '@/client/features/applets/applet-log'
import { initConnection } from '@/client/features/chat/connection/chat-connection'
import { AppRouter } from './app/AppRouter'

const queryClient = new QueryClient()

// Open the single app-wide chat WebSocket once and hand it the query client so
// live frames fold into the RQ transcript cache. Lives for the page's lifetime.
initConnection(queryClient)

// Catch applet errors that escape React (handlers, async effects) and journal
// them for `moi debug logs` — attribution is by bundle URL in the stack, so
// host-app errors never match (see features/applets/applet-log.ts).
installAppletErrorHook()

export function mount(el: HTMLElement) {
  function Root() {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router>
            <AppRouter />
          </Router>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    )
  }

  createRoot(el).render(<Root />)
}
