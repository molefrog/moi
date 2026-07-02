import { useEffect } from 'react'

import { Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/client/lib/connection'

import { HomePage } from './HomePage'
import { PlaygroundPage } from './playground/PlaygroundPage'
import { ToolCallsPage } from './playground/ToolCallsPage'
import { WorkspaceRoute } from './routes/workspace/[id]'
import { CreateWorkspacePage } from './routes/workspace/create'

// Top-level router — sets up all client-side routes
export function AppRouter() {
  const [, navigate] = useLocation()

  // When the server broadcasts a workspace:switch (e.g. from `moi start`),
  // navigate to that workspace
  useEffect(() => {
    setWorkspaceSwitchHandler(id => navigate(`/workspace/${id}`))
    return () => setWorkspaceSwitchHandler(null)
  }, [navigate])

  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/playground/tool-calls" component={ToolCallsPage} />
      <Route path="/playground" component={PlaygroundPage} />
      {/* Must precede `/workspace/:id` — the Switch matches in order, so the
          literal route wins over the id pattern. */}
      <Route path="/workspace/create" component={CreateWorkspacePage} />
      <Route path="/workspace/:id">
        {/* Key by id so switching workspaces mounts a fresh subtree — the
            per-workspace chat store (and its websocket) tears down and resets
            cleanly rather than leaking state across workspaces. Cached React
            Query data keeps the remount instant. */}
        {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
      </Route>
    </Switch>
  )
}
