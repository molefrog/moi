import { Suspense, lazy, useEffect } from 'react'

import { Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/client/features/chat/chat-connection'

import { HomeRoute } from './routes/HomeRoute'
import { WorkspaceRoute } from './routes/WorkspaceRoute'

// Dev-only playground routes: colocated in features/dev and loaded as a
// separate lazy chunk so none of it ships in the main bundle's hot path.
const DevRoutes = lazy(() => import('@/client/features/dev/DevRoutes'))

function DevLazy() {
  return (
    <Suspense fallback={null}>
      <DevRoutes />
    </Suspense>
  )
}

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
      <Route path="/dev/*?" component={DevLazy} />
      <Route path="/workspace/:id">
        {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
      </Route>
    </Switch>
  )
}
