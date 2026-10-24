// One component preview per page, on a blank canvas: `/#<registry name>`.
// The visual tests mount the design system's components this way so a capture
// holds the component and nothing of the playground around it.
import '@/client/structured-clone-shim'
import '@/client/index.css'

import { createRoot } from 'react-dom/client'

import { UI_COMPONENT_PREVIEWS } from '@/client/features/dev/ui-components/ui-component-previews'

const name = decodeURIComponent(location.hash.slice(1))
const Preview = UI_COMPONENT_PREVIEWS[name as keyof typeof UI_COMPONENT_PREVIEWS]

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing')
createRoot(root).render(
  // An applet frame, as in the app: overlays like the drawer open inside the
  // nearest [data-applet].
  <main
    data-applet="dev:ui-components"
    className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-muted p-10 font-sans text-foreground"
  >
    {Preview ? <Preview /> : <p>No preview named {JSON.stringify(name)}</p>}
  </main>
)
