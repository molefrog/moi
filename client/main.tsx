import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Agentation } from 'agentation'
import { createRoot } from 'react-dom/client'
import { Router, useRoute } from 'wouter'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { installAppletErrorHook } from '@/client/features/applets/applet-log'
import { initConnection } from '@/client/features/chat/chat-connection'
import { AppRouter } from './app/AppRouter'

const queryClient = new QueryClient()

// Agentation has no built-in route filter (checked v2.3.3 props), so gate the
// mount ourselves: the harness debug page is a raw log surface where the
// annotation toolbar just overlaps the panes.
function DevAgentation() {
  const [onHarnessDebug] = useRoute('/dev/harness')
  return onHarnessDebug ? null : <Agentation />
}

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
          {process.env.NODE_ENV === 'development' && <DevAgentation />}
        </TooltipProvider>
      </QueryClientProvider>
    )
  }

  createRoot(el).render(<Root />)
}
