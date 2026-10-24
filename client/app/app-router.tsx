import { Suspense, lazy, useEffect } from 'react'

import { Redirect, Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/client/features/chat/connection/chat-connection'
import { useWorkspaceStateSync } from '@/client/features/workspace/workspace-state'

import { SettingsRoute } from './routes/settings-route'
import { HomeRoute } from './routes/home-route'
import { WorkspaceRoute } from './routes/workspace-route'

// Dev-only playground routes: colocated in features/dev and loaded as a
// separate lazy chunk. Both gates are statically false in the prod build
// (scripts/build-client.ts defines them), so the bundler drops the dynamic
// import and none of features/dev is emitted into dist at all. In prod /dev
// redirects home. MOI_DEV_ROUTES keeps them in a prod build for the visual
// tests, which capture the playground pages.
const DevRoutes =
  process.env.NODE_ENV === 'development' || process.env.MOI_DEV_ROUTES === 'true'
    ? lazy(() => import('@/client/features/dev/dev-routes'))
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
  useWorkspaceStateSync()

  // When the server broadcasts a workspace:switch (e.g. from `moi start`),
  // navigate to that workspace
  useEffect(() => {
    setWorkspaceSwitchHandler(id => navigate(`/workspace/${id}`))
    return () => setWorkspaceSwitchHandler(null)
  }, [navigate])

  return (
    <Switch>
      <Route path="/dev/*?" component={DevLazy} />
      <Route path="/" component={HomeRoute} />
      <Route path="/settings" component={SettingsRoute} />
      {/* The wildcard is the destination path (`views/orders`, `overview`, …) —
          the URL is the tab address, read downstream with `useParams`. This
          pattern is its only definition. Keyed by workspace id only, so tab
          switches never remount the workspace tree. */}
      <Route path="/workspace/:id/*?">
        {(params: { id: string }) => <WorkspaceRoute key={params.id} id={params.id} />}
      </Route>
    </Switch>
  )
}
