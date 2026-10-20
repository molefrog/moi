import { createContext, useContext } from 'react'

import type { WorkspaceEventsClient } from './workspace-events'

// App-wide state that lives exactly as long as the app: created by
// `AppProvider` (app/app-provider.tsx) when the app mounts and shut down when
// it unmounts. Put things here that must survive route switches but not the
// app itself.
export type AppContextValue = {
  // The page's workspace events socket.
  events: WorkspaceEventsClient
}

export const AppContext = createContext<AppContextValue | undefined>(undefined)

// Undefined outside `AppProvider` (isolated sandboxes, component tests);
// callers treat that as "no app-wide services" and do nothing.
export function useAppContext(): AppContextValue | undefined {
  return useContext(AppContext)
}
