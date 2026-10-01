import { lazy, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'

import { ChatStatesPage } from './ChatStatesPage'
import { BlobatarShapesPage } from './BlobatarShapesPage'
import { DevIndexPage } from './DevIndexPage'
import { HarnessDebugPage } from './HarnessDebugPage'
import { TextureLabPage } from './TextureLabPage'
import { ToolCallsPage } from './ToolCallsPage'
import { UiComponentsPage } from './UiComponentsPage'

// All /dev/* routes live with their pages here and load only in development;
// see the dynamic import in AppRouter. /dev itself is the index; list new
// routes there too.
const DevCollabPage = lazy(() =>
  import('./collab/dev-collab-page').then(module => ({ default: module.DevCollabPage }))
)

export default function DevRoutes() {
  return (
    <Switch>
      <Route path="/dev/collab-kit">
        <Redirect to="/dev/collab" />
      </Route>
      <Route path="/dev/collab">
        <Suspense fallback={null}>
          <DevCollabPage />
        </Suspense>
      </Route>
      <Route path="/dev/harness" component={HarnessDebugPage} />
      <Route path="/dev/blobatar-shapes" component={BlobatarShapesPage} />
      <Route path="/dev/chat-states" component={ChatStatesPage} />
      <Route path="/dev/tool-calls" component={ToolCallsPage} />
      <Route path="/dev/textures" component={TextureLabPage} />
      <Route path="/dev/ui-components" component={UiComponentsPage} />
      <Route path="/dev" component={DevIndexPage} />
    </Switch>
  )
}
