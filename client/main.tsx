import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Agentation } from 'agentation'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'

import { installAppletErrorHook } from '@/client/features/applets/applet-log'
import { initConnection } from '@/client/features/chat/chat-connection'
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
        <Router>
          <AppRouter />
        </Router>
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </QueryClientProvider>
    )
  }

  createRoot(el).render(<Root />)
}
