import { useEffect } from 'react'

import { Route, Switch, useLocation } from 'wouter'

import { CodexDebugPage } from '@/client/components/playground/CodexDebugPage'
import { PlaygroundPage } from '@/client/components/playground/PlaygroundPage'
import { ToolCallsPage } from '@/client/components/playground/ToolCallsPage'
import { setWorkspaceSwitchHandler } from '@/client/features/chat/chat-connection'
import { ConnectorsPage } from '@/client/features/connectors/ConnectorsPage'

import { HomeRoute } from './routes/HomeRoute'
import { WorkspaceRoute } from './routes/WorkspaceRoute'

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
      <Route path="/" component={HomeRoute} />
      <Route path="/connectors" component={ConnectorsPage} />
      <Route path="/playground/codex" component={CodexDebugPage} />
      <Route path="/playground/tool-calls" component={ToolCallsPage} />
      <Route path="/playground" component={PlaygroundPage} />
      <Route path="/workspace/:id">
        {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
      </Route>
    </Switch>
  )
}
