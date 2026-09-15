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
import type { CollabJsonValue, CollabOperation, CollabParticipant } from '@/lib/collab/types'

import { CollabClient } from './client'
import { getIdentity, installIdentityApi, subscribeIdentityStore } from './identity'
import { participantForSelf } from './store'
import type { CollabStore } from './store'
import type { MutationOutcome } from './store'

type AppletIdentity = { kind: AppletKind; name: string }
type Mount = { applet: AppletIdentity; active: boolean; surface: string }
const WorkspaceContext = createContext<CollabClient | null>(null)
const MountContext = createContext<Mount | null>(null)

installIdentityApi()

// The route segment after `/workspace/:id/`, which is the workspace tab id.
export function pageFromPath(path: string): string {
  return path.split('/').slice(3).join('/') || 'overview'
}

export type CollabWorkspaceProviderProps = {
  workspaceId: string
  children: ReactNode
}
export function CollabWorkspaceProvider({ workspaceId, children }: CollabWorkspaceProviderProps) {
  const [client] = useState(() => new CollabClient(workspaceId))
  const [path] = useLocation()
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('moi:collab-ready'))
    return client.start()
  }, [client])
  useEffect(() => {
    client.store.setLocation({ page: pageFromPath(path) })
  }, [client, path])
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'hidden') client.store.setLocation(null)
      else client.store.setLocation({ page: pageFromPath(location.pathname) })
    }
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [client])
  return <WorkspaceContext value={client}>{children}</WorkspaceContext>
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

function useCollabClient(): CollabClient {
  const client = useContext(WorkspaceContext)
  if (!client) throw new Error('Start moi with --experimental-collab to use collaboration.')
  return client
}

export function useCollabStore(): CollabStore {
  return useCollabClient().store
}

export function useConnection() {
  const store = useCollabStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useSelf(): CollabParticipant | null {
  const state = useConnection()
  const identity = useSyncExternalStore(subscribeIdentityStore, getIdentity, getIdentity)
  return useMemo(() => (identity ? participantForSelf(state, identity) : null), [state, identity])
}

export type OthersOptions = { scope?: 'page' | 'workspace' }
export function useOthers({ scope = 'page' }: OthersOptions = {}): CollabParticipant[] {
  const state = useConnection()
  const store = useCollabStore()
  return useMemo(
    () =>
      state.participants.filter(
        participant =>
          participant.connectionId !== state.connectionId &&
          (scope === 'workspace' ||
            (store.getLocation() !== null &&
              participant.location?.page === store.getLocation()?.page))
      ),
    [state, store, scope]
  )
}

export function useMount(): Mount {
  const mount = useContext(MountContext)
  if (!mount) throw new Error('This collaboration hook must be used inside an applet.')
  return mount
}

export type PresenceValue<T> = { participant: CollabParticipant; value: T }
export function usePresence<T extends CollabJsonValue>(channel: string, initialValue: T) {
  return usePresenceChannel(`custom:${channel}`, initialValue)
}

export function usePresenceChannel<T extends CollabJsonValue>(channel: string, initialValue: T) {
  const store = useCollabStore()
  const mount = useMount()
  const others = useOthers()
  const [value, setValue] = useState(initialValue)
  const [registrationId] = useState(() => crypto.randomUUID())
  const live = useRef(false)
  const valueRef = useRef(value)

  useLayoutEffect(() => {
    if (!mount.active) return
    live.current = true
    const publish = () => {
      if (document.visibilityState === 'hidden') store.deletePresence(registrationId)
      else
        store.setPresence({
          registrationId,
          surface: mount.surface,
          channel,
          value: valueRef.current
        })
    }
    publish()
    document.addEventListener('visibilitychange', publish)
    return () => {
      live.current = false
      document.removeEventListener('visibilitychange', publish)
      store.deletePresence(registrationId)
    }
  }, [store, mount.active, mount.surface, channel, registrationId])

  const update = useCallback(
    (next: T) => {
      if (!live.current) return
      valueRef.current = next
      setValue(next)
      if (mount.active && document.visibilityState !== 'hidden') {
        store.setPresence({ registrationId, surface: mount.surface, channel, value: next })
      }
    },
    [store, mount.active, mount.surface, channel, registrationId]
  )

  const otherValues = useMemo(
    () =>
      others.flatMap(participant =>
        participant.presence
          .filter(
            registration =>
              registration.surface === mount.surface && registration.channel === channel
          )
          .map(registration => ({ participant, value: registration.value as T }))
      ),
    [others, mount.surface, channel]
  )
  return { value, setValue: update, others: otherValues }
}

export type SharedOptions = { scope?: string }
export type SharedStateOptions<T> = SharedOptions & { defaultValue?: T }

function useScope(explicitScope?: string) {
  const client = useCollabClient()
  const store = client.store
  const mount = useMount()
  const scope = explicitScope ?? `applet:${mount.surface}`
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeScope(scope, listener),
    [store, scope]
  )
  const getSnapshot = useCallback(() => store.getScopeSnapshot(scope), [store, scope])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const connection = useConnection()
  const live = useRef(false)
  useLayoutEffect(() => {
    if (!mount.active) return
    live.current = true
    const release = store.acquireScope(scope)
    const releaseConnection = client.acquireSharedState()
    return () => {
      live.current = false
      release()
      releaseConnection()
    }
  }, [client, store, scope, mount.active])
  const mutate = useCallback(
    (operations: CollabOperation[]): Promise<MutationOutcome> => {
      if (!live.current)
        return Promise.resolve({ status: 'rejected', message: 'This applet is no longer active.' })
      return store.mutate(scope, operations)
    },
    [store, scope]
  )
  return {
    mutate,
    state,
    canWrite: mount.active && state.synced && connection.status === 'connected'
  }
}

export function useSharedState<T extends CollabJsonValue>(
  key: string,
  options: SharedStateOptions<T> = {}
) {
  const { mutate, state, canWrite } = useScope(options.scope)
  const setValue = useCallback((value: T) => mutate([{ type: 'set', key, value }]), [mutate, key])
  const deleteValue = useCallback(() => mutate([{ type: 'delete', key }]), [mutate, key])
  const exists = Object.hasOwn(state.entries, key)
  return {
    value: state.loaded ? (exists ? (state.entries[key] as T) : options.defaultValue) : undefined,
    exists: state.loaded && exists,
    loaded: state.loaded,
    canWrite,
    isSaving: state.isSaving,
    error: state.error,
    setValue,
    deleteValue
  }
}

export function useSharedStore(prefix = '', options: SharedOptions = {}) {
  const { mutate, state, canWrite } = useScope(options.scope)
  const entries = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(state.entries)
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, value]) => [key.slice(prefix.length), value])
      ),
    [state.entries, prefix]
  )
  const batch = useCallback(
    (operations: CollabOperation[]) =>
      mutate(operations.map(operation => ({ ...operation, key: prefix + operation.key }))),
    [mutate, prefix]
  )
  const set = useCallback(
    (key: string, value: CollabJsonValue) => batch([{ type: 'set', key, value }]),
    [batch]
  )
  const remove = useCallback((key: string) => batch([{ type: 'delete', key }]), [batch])
  return {
    entries,
    loaded: state.loaded,
    canWrite,
    isSaving: state.isSaving,
    error: state.error,
    set,
    delete: remove,
    batch
  }
}
