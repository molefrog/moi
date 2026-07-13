import { lazy, Suspense, useEffect } from 'react'

import { Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/client/features/chat/chat-connection'

const HomeRoute = lazy(() =>
  import('./routes/HomeRoute').then(module => ({ default: module.HomeRoute }))
)
const WorkspaceRoute = lazy(() =>
  import('./routes/WorkspaceRoute').then(module => ({ default: module.WorkspaceRoute }))
)
const ConnectorsPage = lazy(() =>
  import('@/client/features/connectors/ConnectorsPage').then(module => ({
    default: module.ConnectorsPage
  }))
)
const PlaygroundPage = lazy(() =>
  import('@/client/components/playground/PlaygroundPage').then(module => ({
    default: module.PlaygroundPage
  }))
)
const ToolCallsPage = lazy(() =>
  import('@/client/components/playground/ToolCallsPage').then(module => ({
    default: module.ToolCallsPage
  }))
)

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
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={HomeRoute} />
        <Route path="/connectors" component={ConnectorsPage} />
        <Route path="/playground/tool-calls" component={ToolCallsPage} />
        <Route path="/playground" component={PlaygroundPage} />
        <Route path="/workspace/:id">
          {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
        </Route>
      </Switch>
    </Suspense>
  )
}
