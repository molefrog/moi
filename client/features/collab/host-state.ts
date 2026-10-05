import { isUserProfile } from '@/lib/collab/protocol'
import { colorForId, isUserColor } from '@/lib/collab/colors'
import type { AuthProvider, ProxyUserState, UserProfile } from '@/lib/collab/types'
import { createLocalUser } from './local-user'

export type UserProfileInput = Omit<UserProfile, 'color'> & { color?: UserProfile['color'] }
export type WorkspaceDirectory<Profile = UserProfile> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly users: readonly Profile[] }
type State<Profile> = {
  readonly currentUser?: Profile
  readonly workspaces: Readonly<Record<string, WorkspaceDirectory<Profile>>>
}
export type HostStateInput = State<UserProfileInput>
export type HostState = State<UserProfile>
export type HostApi = {
  getHostState: () => HostState | undefined
  setHostState: (state: HostStateInput) => void
  subscribeHostState: (listener: (state: HostState | undefined) => void) => () => void
}
// Who supplies the current user: local setup, an outer host, or an auth proxy.
export type CurrentUserSource = 'local' | 'external' | AuthProvider

// Keep the existing key so local profiles survive the startup change.
const PROFILE_KEY = 'moi:collab:dev-profile'
let currentUser: UserProfile | undefined
let installed = false
let currentUserSource: CurrentUserSource | undefined
const listeners = new Set<() => void>()
const workspaceListeners = new Map<string, Set<() => void>>()
const hostListeners = new Set<() => void>()
const EMPTY_WORKSPACES = Object.freeze({})
const LOADING_DIRECTORY = Object.freeze({ status: 'loading' as const })
let hostState: HostState | undefined

export function normalizeUserProfile(value: UserProfileInput): UserProfile {
  if (!value || typeof value.id !== 'string' || !value.id.trim())
    throw new Error('A user profile needs an id.')
  if (value.name !== undefined && typeof value.name !== 'string')
    throw new Error('A user profile name must be a string when provided.')
  if (value.color !== undefined && !isUserColor(value.color))
    throw new Error('A user profile color must be one of the user palette names.')
  const id = value.id.trim()
  const name = value.name?.trim()
  const normalized: UserProfile = {
    id,
    ...(name ? { name } : {}),
    color: value.color ?? colorForId(id),
    ...(value.avatar !== undefined ? { avatar: value.avatar } : {}),
    ...(value.email !== undefined ? { email: value.email } : {})
  }
  if (!isUserProfile(normalized)) throw new Error('Invalid user profile.')
  return Object.freeze(normalized)
}

export function normalizeWorkspaceUsers(
  users: readonly UserProfileInput[]
): readonly UserProfile[] {
  if (!Array.isArray(users)) throw new Error('Workspace users must be an array.')
  const ids = new Set<string>()
  const snapshot = users.map(user => {
    const normalized = normalizeUserProfile(user)
    if (ids.has(normalized.id)) throw new Error('Workspace users must have unique ids.')
    ids.add(normalized.id)
    return normalized
  })
  return Object.freeze(snapshot)
}

function normalizeHostState(value: HostStateInput): HostState {
  if (!value || typeof value !== 'object') throw new Error('Invalid host state.')
  const current =
    value.currentUser === undefined ? undefined : normalizeUserProfile(value.currentUser)
  if (!value.workspaces || typeof value.workspaces !== 'object' || Array.isArray(value.workspaces))
    throw new Error('Host workspaces must be a record.')
  const entries = Object.entries(value.workspaces).map(([id, directory]) => {
    if (!id.trim() || !directory || typeof directory !== 'object')
      throw new Error('Invalid workspace directory.')
    if (directory.status === 'loading') return [id, LOADING_DIRECTORY] as const
    if (directory.status !== 'ready') throw new Error('Invalid workspace directory status.')
    const profiles = normalizeWorkspaceUsers(directory.users)
    // The viewer has one global profile; membership is still workspace-specific.
    const users = Object.freeze(
      profiles.map(user => (current && user.id === current.id ? current : user))
    )
    return [id, Object.freeze({ status: 'ready' as const, users })] as const
  })
  // Validate everything before discarding directories on sign-out.
  return Object.freeze({
    currentUser: current,
    workspaces: current ? Object.freeze(Object.fromEntries(entries)) : EMPTY_WORKSPACES
  })
}

export function getHostState(): HostState | undefined {
  return hostState
}

export function getWorkspaceDirectory(workspaceId: string): WorkspaceDirectory | undefined {
  if (!hostState) return undefined
  const directory = Object.hasOwn(hostState.workspaces, workspaceId)
    ? hostState.workspaces[workspaceId]
    : undefined
  return directory ?? LOADING_DIRECTORY
}

export function setHostState(next: HostStateInput): void {
  const normalized = normalizeHostState(next)
  const previousDirectories = new Map(
    [...workspaceListeners.keys()].map(id => [id, getWorkspaceDirectory(id)])
  )
  // Publish every field before notifying any observer, including transport listeners.
  hostState = normalized
  currentUserSource = 'external'
  currentUser = normalized.currentUser
  listeners.forEach(listener => listener())
  for (const [id, subscriptions] of workspaceListeners) {
    if (getWorkspaceDirectory(id) !== previousDirectories.get(id))
      subscriptions.forEach(listener => listener())
  }
  hostListeners.forEach(listener => listener())
}

export function subscribeHostStateStore(listener: () => void): () => void {
  hostListeners.add(listener)
  return () => {
    hostListeners.delete(listener)
  }
}

export function subscribeHostState(listener: (state: HostState | undefined) => void): () => void {
  const unsubscribe = subscribeHostStateStore(() => listener(getHostState()))
  listener(getHostState())
  return unsubscribe
}

export function subscribeWorkspaceUsersStore(
  workspaceId: string,
  listener: () => void
): () => void {
  let subscriptions = workspaceListeners.get(workspaceId)
  if (!subscriptions) {
    subscriptions = new Set()
    workspaceListeners.set(workspaceId, subscriptions)
  }
  subscriptions.add(listener)
  return () => {
    subscriptions.delete(listener)
    if (!subscriptions.size) workspaceListeners.delete(workspaceId)
  }
}

export function getCurrentUser(): UserProfile | undefined {
  return currentUser
}

export function subscribeCurrentUserStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCurrentUserSource(): CurrentUserSource | undefined {
  return currentUserSource
}

// An auth proxy takes precedence over local users; an outer host takes
// precedence over the proxy. A configured proxy with no user signs this tab out.
export function setProxyUserState({ provider, profile }: ProxyUserState): void {
  if (currentUserSource === 'external') return
  if (provider === undefined) {
    if (currentUserSource === undefined || currentUserSource === 'local') return
    currentUserSource = undefined
    currentUser = undefined
  } else {
    const normalized = profile === undefined ? undefined : normalizeUserProfile(profile)
    if (
      currentUserSource === provider &&
      JSON.stringify(currentUser) === JSON.stringify(normalized)
    )
      return
    currentUserSource = provider
    currentUser = normalized
  }
  listeners.forEach(listener => listener())
}

function persistLocalUser(): void {
  try {
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(currentUser))
  } catch {
    /* Private browsing. */
  }
}

export function setLocalUser(next: UserProfile): void {
  // A provider may take over between rendering the local user form and handling input.
  if (currentUserSource !== undefined && currentUserSource !== 'local') return
  const normalized = normalizeUserProfile(next)
  currentUserSource = 'local'
  currentUser = normalized
  persistLocalUser()
  listeners.forEach(listener => listener())
}

// Called after startup config and proxy identity settle, before React mounts.
export function initializeLocalUser(enabled: boolean, proxyUser: ProxyUserState | undefined): void {
  if (!enabled || !proxyUser || proxyUser.provider !== undefined || currentUserSource !== undefined)
    return
  try {
    const saved = sessionStorage.getItem(PROFILE_KEY)
    if (saved) {
      setLocalUser(JSON.parse(saved) as UserProfile)
      return
    }
  } catch {
    /* Invalid or unavailable storage starts a fresh local profile. */
  }
  setLocalUser(createLocalUser())
}

// A host supplies one initial atomic snapshot before loading moi's modules.
export function installHostApi(): void {
  if (typeof window === 'undefined' || installed) return
  installed = true
  const host = window as Window & {
    moi?: {
      collab?: {
        getHostState?: () => HostStateInput | undefined
      }
      [key: string]: unknown
    }
  }
  const previous = host.moi?.collab
  if (previous?.getHostState) {
    try {
      setHostState(previous.getHostState() ?? { workspaces: {} })
    } catch {
      // An unavailable host remains authoritative; never restore a local profile.
      setHostState({ workspaces: {} })
    }
  }
  host.moi ??= {}
  const api: HostApi = {
    getHostState,
    setHostState,
    subscribeHostState
  }
  host.moi.collab = api
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('moi:collab-ready'))
  }
}
