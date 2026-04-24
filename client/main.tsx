import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Agentation } from 'agentation'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'

import { AppRouter } from './components/App'

const queryClient = new QueryClient()

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
