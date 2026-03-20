import { createRoot } from 'react-dom/client'
import { Agentation } from 'agentation'

import { App } from './components/App'

export function mount(el: HTMLElement) {
  function Root() {
    return (
      <>
        <App />
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </>
    )
  }

  createRoot(el).render(<Root />)
}
