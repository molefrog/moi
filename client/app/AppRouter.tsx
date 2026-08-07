import { Suspense, lazy, useEffect } from 'react'

import { Redirect, Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/client/features/chat/chat-connection'

import { HomeRoute } from './routes/HomeRoute'
import { WorkspaceRoute } from './routes/WorkspaceRoute'

// Dev-only playground routes: colocated in features/dev and loaded as a
// separate lazy chunk. The NODE_ENV gate is statically false in the prod
// build (scripts/build-client.ts defines it), so the bundler drops the
// dynamic import and none of features/dev is emitted into dist at all —
// same mechanism as DevAgentation in main.tsx. In prod /dev redirects home.
const DevRoutes =
  process.env.NODE_ENV === 'development'
    ? lazy(() => import('@/client/features/dev/DevRoutes'))
    : null

function DevLazy() {
  if (!DevRoutes) return <Redirect to="/" />
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
      {/* The wildcard is the workspace tab id (`view:orders`, `widgets`, …) —
          the URL is the tab address, read downstream with `useParams`. This
          pattern is its only definition. Keyed by workspace id only, so tab
          switches never remount the workspace tree. */}
      <Route path="/workspace/:id/*?">
        {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
      </Route>
    </Switch>
  )
}
