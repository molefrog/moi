import { createRoot } from 'react-dom/client'
import { Agentation } from 'agentation'

import './index.css'
import { App } from './components/App'

function Root() {
  return (
    <>
      <App />
      {process.env.NODE_ENV === 'development' && <Agentation />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
