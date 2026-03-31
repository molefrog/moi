import { Agentation } from 'agentation'
import { createRoot } from 'react-dom/client'

import { AppLoader } from './components/App'

export function mount(el: HTMLElement) {
  function Root() {
    return (
      <>
        <AppLoader />
        {process.env.NODE_ENV === 'development' && <Agentation />}
      </>
    )
  }

  createRoot(el).render(<Root />)
}
