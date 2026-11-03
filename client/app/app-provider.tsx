import type { HarnessStatuses } from '@/lib/types'
import { useQueryClient } from '@tanstack/react-query'
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
  const client = useQueryClient()
  const [value] = useState<AppContextValue>(() => ({
    events: new WorkspaceEventsClient(wsUrl('/api/workspaces/ws'))
  }))

  useEffect(() => {
    const unsubscribe = value.events.subscribe(event => {
      if (event.type === 'harness-status:changed') {
        const queryKey = ['harness-status']
        void client.cancelQueries({ queryKey })
        client.setQueryData<HarnessStatuses>(queryKey, previous =>
          previous ? { ...previous, [event.harness]: event.status } : undefined
        )
        if (!client.getQueryData(queryKey)) void client.invalidateQueries({ queryKey })
        if (event.status.availability.status === 'available')
          void client.invalidateQueries({ queryKey: ['workspaces', 'harness'] })
      } else if (event.type === 'connection:opened' || event.type === 'harness:updated') {
        void client.invalidateQueries({ queryKey: ['harness-status'] })
      }
    })
    value.events.connect()
    return () => {
      unsubscribe()
      value.events.close()
    }
  }, [value, client])

  return <AppContext value={value}>{children}</AppContext>
}
