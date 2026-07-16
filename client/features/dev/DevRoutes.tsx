import { Route, Switch } from 'wouter'

import { HarnessDebugPage } from './HarnessDebugPage'
import { PlaygroundPage } from './PlaygroundPage'
import { ToolCallsPage } from './ToolCallsPage'

// All /dev/* routes, colocated with their pages so the whole dev playground
// (and its dependencies) lives in this folder and loads as one lazy chunk —
// see the dynamic import in AppRouter.
export default function DevRoutes() {
  return (
    <Switch>
      <Route path="/dev/harness" component={HarnessDebugPage} />
      <Route path="/dev/tool-calls" component={ToolCallsPage} />
      <Route path="/dev" component={PlaygroundPage} />
    </Switch>
  )
}
