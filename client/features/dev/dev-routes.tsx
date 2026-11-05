import { lazy, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'

import { ChatStatesPage } from './chat-states-page'
import { BlobatarShapesPage } from './blobatar-shapes-page'
import { DevIndexPage } from './dev-index-page'
import { WorkspaceSetupPage } from './workspace-setup-page'
import { HarnessDebugPage } from './harness-debug-page'
import { TextureLabPage } from './texture-lab-page'
import { ToolCallsPage } from './tool-calls-page'
import { UiComponentsPage } from './ui-components/ui-components-page'
import { OnboardingPreviewPage } from './onboarding-preview-page'
import { CloudPage } from './cloud-page'

// All /dev/* routes live with their pages here and load only in development;
// see the dynamic import in AppRouter. /dev itself is the index; list new
// routes there too.
const CollabPage = lazy(() =>
  import('./collab/collab-page').then(module => ({ default: module.CollabPage }))
)

export default function DevRoutes() {
  return (
    <Switch>
      <Route path="/dev/cloud" component={CloudPage} />
      <Route path="/dev/onboarding" component={OnboardingPreviewPage} />
      <Route path="/dev/collab-kit">
        <Redirect to="/dev/collab" />
      </Route>
      <Route path="/dev/collab">
        <Suspense fallback={null}>
          <CollabPage />
        </Suspense>
      </Route>
      <Route path="/dev/workspace-setup" component={WorkspaceSetupPage} />
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
