import { Route, Switch } from 'wouter'

import { ChatStatesPage } from './ChatStatesPage'
import { BlobatarShapesPage } from './BlobatarShapesPage'
import { DevIndexPage } from './DevIndexPage'
import { HarnessDebugPage } from './HarnessDebugPage'
import { TextureLabPage } from './TextureLabPage'
import { ToolCallsPage } from './ToolCallsPage'
import { UiComponentsPage } from './UiComponentsPage'

// All /dev/* routes, colocated with their pages so the whole dev playground
// (and its dependencies) lives in this folder and loads as one lazy chunk —
// see the dynamic import in AppRouter. /dev itself is the index; list new
// routes there too.
export default function DevRoutes() {
  return (
    <Switch>
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
