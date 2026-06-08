import { useEffect } from 'react'

import { Route, Switch, useLocation } from 'wouter'

import { setWorkspaceSwitchHandler } from '@/client/lib/ws'

import { HomePage } from './HomePage'
import { SidebarLayoutPage } from './layout/SidebarLayoutPage'
import { PlaygroundPage } from './playground/PlaygroundPage'
import { WorkspaceRoute } from './routes/workspace/[id]'

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
      <Route path="/playground" component={PlaygroundPage} />
      <Route path="/sidebar" component={SidebarLayoutPage} />
      <Route path="/workspace/:id">
        {(params: { id: string }) => <WorkspaceRoute id={params.id} />}
      </Route>
    </Switch>
  )
}
