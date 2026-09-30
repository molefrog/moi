import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react'
import type { JsonValue } from 'moi'
import type { PresenceValue, WorkspaceUsersAvailability } from 'moi/collab'

import { useAppletPresence, useCollabEngine } from './provider'
import { resolvePeers, resolveUser, workspaceProfiles } from './users'
import type { WorkspaceUser, UsePeersOptions, UseWorkspaceUsersOptions } from './users'
import { createPresencePublisher } from './presence-publisher'

export type { WorkspaceUser, UsePeersOptions, UseWorkspaceUsersOptions } from './users'

export function useConnectionState() {
  const engine = useCollabEngine()
  return useSyncExternalStore(engine.subscribe, engine.getUsersSnapshot, engine.getUsersSnapshot)
}
function useWorkspaceDirectory() {
  const engine = useCollabEngine()
  return useSyncExternalStore(
    engine.subscribeWorkspaceUsers,
    engine.getWorkspaceDirectory,
    engine.getWorkspaceDirectory
  )
}
export function useWorkspaceUsersAvailability(): WorkspaceUsersAvailability {
  return useWorkspaceDirectory().status
}
function useUsersSource() {
  const engine = useCollabEngine()
  const state = useConnectionState()
  const self = useSyncExternalStore(
    engine.subscribeCurrentUser,
    engine.getCurrentUser,
    engine.getCurrentUser
  )
  const directory = useWorkspaceDirectory()
  const users = useMemo(
    () =>
      workspaceProfiles(
        state.users,
        self,
        directory.status === 'unavailable' ? null : directory.users
      ),
    [state.users, self, directory]
  )
  return { state, self, users, engine }
}
export function useUser(id: string): WorkspaceUser | undefined {
  const { state, users } = useUsersSource()
  return useMemo(() => resolveUser({ ...state, users }, id), [state, users, id])
}
export function useUsers(ids: readonly string[]): (WorkspaceUser | undefined)[] {
  const { state, users } = useUsersSource()
  return ids.map(id => resolveUser({ ...state, users }, id))
}
export function useWorkspaceUsers({ status }: UseWorkspaceUsersOptions = {}): WorkspaceUser[] {
  const { state, users } = useUsersSource()
  return useMemo(
    () =>
      users
        .map(user => resolveUser({ ...state, users }, user.id)!)
        .filter(user => !status || user.status === status),
    [state, users, status]
  )
}
export function useMe(): WorkspaceUser | undefined {
  const { state, self, users } = useUsersSource()
  return useMemo(
    () => (self ? resolveUser({ ...state, users }, self.id) : undefined),
    [state, self, users]
  )
}
export function usePeers(options: UsePeersOptions = {}): WorkspaceUser[] {
  const { state, self, users, engine } = useUsersSource()
  const { scope, status } = options
  return useMemo(
    () => resolvePeers({ ...state, users }, self?.id, engine.getLocation(), { scope, status }),
    [state, self, users, engine, scope, status]
  )
}
export const presenceChannels = {
  custom: (channel: string) => `custom:${channel}`,
  cursor: (id: string) => `cursor:${id}`,
  field: (target: string) => `field:${target}`,
  selection: (target: string) => `selection:${target}`
}
export type { PresenceValue } from 'moi/collab'

// Observation never allocates a registration or publishes a value.
export function usePresence<T extends JsonValue>(channel: string): PresenceValue<T>[] {
  return usePresenceChannel<T>(presenceChannels.custom(channel))
}
export function usePresenceChannel<T extends JsonValue>(channel: string): PresenceValue<T>[] {
  const { users, engine } = useUsersSource()
  const presence = useAppletPresence()
  const appletId = presence?.appletId ?? ''
  const snapshot = useCallback(
    () => engine.getPresenceSnapshot(appletId, channel),
    [engine, appletId, channel]
  )
  const entries = useSyncExternalStore(engine.subscribe, snapshot, snapshot)
  return useMemo(() => {
    if (!presence?.active) return []
    const known = new Set(users.map(user => user.id))
    return entries
      .filter(entry => known.has(entry.userId))
      .map(entry => ({
        connectionId: entry.connectionId,
        userId: entry.userId,
        value: entry.value as T
      }))
  }, [entries, users, presence])
}

// Internal imperative publisher for pointer/focus events. Ownership is per mount.
export function usePresencePublisher<T extends JsonValue>(
  channel: string,
  initialValue: T,
  isPresent?: (value: T) => boolean
): (value: T) => void {
  const engine = useCollabEngine()
  const presence = useAppletPresence()
  const [registrationId] = useState(() => crypto.randomUUID())
  const valueRef = useRef(initialValue)
  const live = useRef(false)
  const appletId = presence?.appletId ?? ''
  const registration = useMemo(
    () => createPresencePublisher<T>(engine, { registrationId, appletId, channel }, isPresent),
    [engine, registrationId, appletId, channel, isPresent]
  )
  const publish = useCallback(() => {
    registration.publish(
      valueRef.current,
      presence?.active === true && document.visibilityState !== 'hidden'
    )
  }, [presence, registration])
  useLayoutEffect(() => {
    if (!presence?.active) return
    live.current = true
    publish()
    document.addEventListener('visibilitychange', publish)
    return () => {
      live.current = false
      document.removeEventListener('visibilitychange', publish)
      registration.clear()
    }
  }, [presence, publish, registration])
  return useCallback(
    (value: T) => {
      valueRef.current = value
      if (live.current) publish()
    },
    [publish]
  )
}
export function usePublishPresenceChannel<T extends JsonValue>(
  channel: string,
  value: T,
  isPresent?: (value: T) => boolean
): void {
  const publish = usePresencePublisher(channel, value, isPresent)
  useLayoutEffect(() => publish(value), [publish, value])
}
export function usePublishPresence<T extends JsonValue>(channel: string, value: T): void {
  usePublishPresenceChannel(presenceChannels.custom(channel), value)
}
