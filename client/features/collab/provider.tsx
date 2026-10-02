import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'wouter'
import { usePathname } from 'wouter/use-browser-location'

import { legacyTabFromPath, tabFromPath, workspacePath } from '@/lib/navigation'

import { CollabClient, NO_ENGINE } from './client'
import type { CollabEngineApi } from './client'

type AppletPresence = { active: boolean; appletId: string }
export const CollabContext = createContext<CollabEngineApi>(NO_ENGINE)
const AppletPresenceContext = createContext<AppletPresence | null>(null)

export function pageFromPath(path: string, workspaceId: string, base = ''): string {
  const prefix = workspacePath(workspaceId, base) + '/'
  const page = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  return tabFromPath(page) ?? legacyTabFromPath(page) ?? (page || 'overview')
}

export type CollabProviderProps = {
  workspaceId: string
  enabled: boolean
  children: ReactNode
}
export function CollabProvider({ workspaceId, enabled, children }: CollabProviderProps) {
  const engine = useMemo(() => new CollabClient(workspaceId, enabled), [workspaceId, enabled])
  const router = useRouter()
  const path = usePathname(router)
  const { base } = router
  useEffect(() => engine.start(), [engine])
  useEffect(() => {
    const update = () =>
      engine.setLocation({
        page: pageFromPath(window.location.pathname, workspaceId, base),
        status: document.visibilityState === 'hidden' ? 'away' : 'active'
      })
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [base, engine, path, workspaceId])
  return <CollabContext value={engine}>{children}</CollabContext>
}

export type AppletPresenceProviderProps = {
  appletId: string
  active?: boolean
  children: ReactNode
}
export function AppletPresenceProvider({
  appletId,
  active = true,
  children
}: AppletPresenceProviderProps) {
  const { enabled } = useCollabEngine()
  const presence = useMemo(
    () => ({ active: enabled && active, appletId }),
    [enabled, active, appletId]
  )
  return <AppletPresenceContext value={presence}>{children}</AppletPresenceContext>
}

export function useCollabEngine(): CollabEngineApi {
  return useContext(CollabContext)
}
export function useAppletPresence(): AppletPresence | null {
  return useContext(AppletPresenceContext)
}

// Collab controls and browser-tab selection require both runtime support and a current user.
export function useCollabEnabled(): boolean {
  const engine = useCollabEngine()
  const currentUser = useSyncExternalStore(
    engine.subscribeCurrentUser,
    engine.getCurrentUser,
    engine.getCurrentUser
  )
  return engine.enabled && currentUser !== undefined
}
