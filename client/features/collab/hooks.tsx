import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'

import type { AppletKind } from '@/lib/types'
import type { CollabJsonValue } from '@/lib/collab/types'

import { createLiveBackend, NO_BACKEND } from './backend'
import type { CollabBackend } from './backend'
import { CollabClient } from './client'
import { installIdentityApi } from './identity'
import { resolvePeers, resolveUser, workspaceProfiles } from './people'
import type { CollabUser, PeersOptions, WorkspaceUsersOptions } from './people'
import { createPresencePublisher } from './presence-publisher'

export type { CollabUser, PeersOptions, WorkspaceUsersOptions } from './people'
type AppletIdentity = { kind: AppletKind; name: string }
type Mount = { applet: AppletIdentity; active: boolean; surface: string }
const BackendContext = createContext<CollabBackend>(NO_BACKEND)
const MountContext = createContext<Mount | null>(null)
installIdentityApi()

export function pageFromPath(path: string): string {
  return path.split('/').slice(3).join('/') || 'overview'
}

export type CollabWorkspaceProviderProps = {
  workspaceId: string
  enabled?: boolean
  children: ReactNode
}
export function CollabWorkspaceProvider({
  workspaceId,
  enabled = true,
  children
}: CollabWorkspaceProviderProps) {
  const client = useMemo(() => new CollabClient(workspaceId), [workspaceId])
  const backend = useMemo(() => createLiveBackend(client, enabled), [client, enabled])
  const [path] = useLocation()
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('moi:collab-ready'))
    if (enabled) return client.start()
  }, [client, enabled])
  useEffect(() => {
    client.store.setLocation(
      document.visibilityState === 'hidden' ? null : { page: pageFromPath(path) }
    )
  }, [client, path])
  useEffect(() => {
    const update = () =>
      client.store.setLocation(
        document.visibilityState === 'hidden' ? null : { page: pageFromPath(location.pathname) }
      )
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [client])
  return <BackendContext value={backend}>{children}</BackendContext>
}

export type CollabBackendProviderProps = { backend: CollabBackend; children: ReactNode }
export function CollabBackendProvider({ backend, children }: CollabBackendProviderProps) {
  return <BackendContext value={backend}>{children}</BackendContext>
}
export type AppletCollabProviderProps = {
  workspaceId: string
  applet: AppletIdentity
  active?: boolean
  children: ReactNode
}
export function AppletCollabProvider({
  applet,
  active = true,
  children
}: AppletCollabProviderProps) {
  const { kind, name } = applet
  const mount = useMemo(
    () => ({ applet: { kind, name }, active, surface: `${kind}:${name}` }),
    [kind, name, active]
  )
  return <MountContext value={mount}>{children}</MountContext>
}

function useBackend(): CollabBackend {
  return useContext(BackendContext)
}
export function useConnection() {
  const backend = useBackend()
  return useSyncExternalStore(backend.subscribe, backend.getSnapshot, backend.getSnapshot)
}
function useUsersSource() {
  const backend = useBackend()
  const state = useConnection()
  const self = useSyncExternalStore(
    backend.subscribeIdentity,
    backend.getIdentity,
    backend.getIdentity
  )
  const directory = useSyncExternalStore(
    backend.subscribeWorkspaceUsers,
    backend.getWorkspaceUsers,
    backend.getWorkspaceUsers
  )
  const users = useMemo(
    () => workspaceProfiles(state.users, self, directory),
    [state.users, self, directory]
  )
  return { state, self, users, backend }
}
export function useUser(id: string): CollabUser | null {
  const { state, users } = useUsersSource()
  return useMemo(() => resolveUser({ ...state, users }, id), [state, users, id])
}
export function useUsers(ids: readonly string[]): (CollabUser | null)[] {
  const { state, users } = useUsersSource()
  return ids.map(id => resolveUser({ ...state, users }, id))
}
export function useWorkspaceUsers({ status }: WorkspaceUsersOptions = {}): CollabUser[] {
  const { state, users } = useUsersSource()
  return useMemo(
    () =>
      users
        .map(user => resolveUser({ ...state, users }, user.id)!)
        .filter(user => !status || user.status === status),
    [state, users, status]
  )
}
export function useMe(): CollabUser | null {
  const { state, self, users } = useUsersSource()
  return useMemo(
    () => (self ? resolveUser({ ...state, users }, self.id) : null),
    [state, self, users]
  )
}
export function usePeers(options: PeersOptions = {}): CollabUser[] {
  const { state, self, users, backend } = useUsersSource()
  const { scope, status } = options
  return useMemo(
    () =>
      resolvePeers({ ...state, users }, self?.id ?? null, backend.getLocation(), { scope, status }),
    [state, self, users, backend, scope, status]
  )
}
export function useMount(): Mount | null {
  return useContext(MountContext)
}

export const presenceChannels = {
  custom: (channel: string) => `custom:${channel}`,
  cursor: (surface: string) => `cursor:${surface}`,
  field: (target: string) => `field:${target}`,
  selection: (target: string) => `selection:${target}`
}
export type PresenceValue<T> = { connectionId: string; userId: string; value: T }

// Observation never allocates a registration or publishes a value.
export function usePresence<T extends CollabJsonValue>(channel: string): PresenceValue<T>[] {
  return usePresenceChannel<T>(presenceChannels.custom(channel))
}
export function usePresenceChannel<T extends CollabJsonValue>(channel: string): PresenceValue<T>[] {
  const { state, users, backend } = useUsersSource()
  const mount = useMount()
  return useMemo(() => {
    const location = backend.getLocation()
    if (!mount?.active || !location) return []
    const known = new Set(users.map(user => user.id))
    return state.participants.flatMap(participant =>
      participant.connectionId === state.connectionId ||
      participant.location?.page !== location.page ||
      !known.has(participant.userId)
        ? []
        : participant.presence
            .filter(
              registration =>
                registration.surface === mount.surface && registration.channel === channel
            )
            .map(registration => ({
              connectionId: participant.connectionId,
              userId: participant.userId,
              value: registration.value as T
            }))
    )
  }, [state, users, backend, mount, channel])
}

// Internal imperative publisher for pointer/focus events. Ownership is per mount.
export function usePresencePublisher<T extends CollabJsonValue>(
  channel: string,
  initialValue: T,
  isPresent?: (value: T) => boolean
): (value: T) => void {
  const backend = useBackend()
  const mount = useMount()
  const [registrationId] = useState(() => crypto.randomUUID())
  const valueRef = useRef(initialValue)
  const live = useRef(false)
  const surface = mount?.surface ?? ''
  const registration = useMemo(
    () => createPresencePublisher<T>(backend, { registrationId, surface, channel }, isPresent),
    [backend, registrationId, surface, channel, isPresent]
  )
  const publish = useCallback(() => {
    registration.publish(
      valueRef.current,
      mount?.active === true && document.visibilityState !== 'hidden'
    )
  }, [mount, registration])
  useLayoutEffect(() => {
    if (!mount?.active) return
    live.current = true
    publish()
    document.addEventListener('visibilitychange', publish)
    return () => {
      live.current = false
      document.removeEventListener('visibilitychange', publish)
      registration.clear()
    }
  }, [mount, publish, registration])
  return useCallback(
    (value: T) => {
      valueRef.current = value
      if (live.current) publish()
    },
    [publish]
  )
}
export function usePublishPresenceChannel<T extends CollabJsonValue>(
  channel: string,
  value: T,
  isPresent?: (value: T) => boolean
): void {
  const publish = usePresencePublisher(channel, value, isPresent)
  useLayoutEffect(() => publish(value), [publish, value])
}
export function usePublishPresence<T extends CollabJsonValue>(channel: string, value: T): void {
  usePublishPresenceChannel(presenceChannels.custom(channel), value)
}
