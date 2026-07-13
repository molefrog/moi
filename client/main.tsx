import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Agentation } from 'agentation'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'

import { initConnection } from './lib/connection'
import { AppRouter } from './components/App'

const queryClient = new QueryClient()

// Open the single app-wide chat WebSocket once and hand it the query client so
// live frames fold into the RQ transcript cache. Lives for the page's lifetime.
initConnection(queryClient)

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
