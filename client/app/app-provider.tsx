import { type ReactNode, useEffect, useState } from 'react'

import { wsUrl } from '@/client/lib/ws-url'
import { AppContext, type AppContextValue } from '@/client/runtime/app-context'
import { WorkspaceEventsClient } from '@/client/runtime/workspace-events'

type AppProviderProps = {
  children: ReactNode
}

// App-wide services, mounted once at the root (main.tsx). Opens the workspace
// events socket when the app mounts and closes it when the app unmounts, so
// the connection outlives every route.
export function AppProvider({ children }: AppProviderProps) {
  const [value] = useState<AppContextValue>(() => ({
    events: new WorkspaceEventsClient(wsUrl('/api/workspaces/ws'))
  }))

  useEffect(() => {
    value.events.connect()
    return () => value.events.close()
  }, [value])

  return <AppContext value={value}>{children}</AppContext>
}
