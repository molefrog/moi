import { Agentation } from 'agentation'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'

import { AppRouter } from './components/App'

export function mount(el: HTMLElement) {
  function Root() {
    return (
      <>
        <Router>
          <AppRouter />
        </Router>
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </>
    )
  }

  createRoot(el).render(<Root />)
}
