import { isUserProfile } from '@/lib/collab/protocol'
import { colorForId, isUserColor } from '@/lib/collab/colors'
import type { AuthProvider, ProxyUserState, UserProfile } from '@/lib/collab/types'
import type { WorkspaceUsersAvailability } from 'moi/collab'

export type CollabShareContext = { workspaceId: string; url: string }
export type CollabShareHandler = (context: CollabShareContext) => Promise<{ url: string }>
export type UserProfileInput = Omit<UserProfile, 'color'> & { color?: UserProfile['color'] }
type HostState<Profile> = {
  readonly currentUser: Profile | null
  readonly workspaces: Readonly<
    Record<
      string,
      | { readonly status: 'loading' }
      | { readonly status: 'ready'; readonly users: readonly Profile[] }
    >
  >
}
export type CollabHostStateInput = HostState<UserProfileInput>
export type CollabHostState = HostState<UserProfile>
export type WorkspaceDirectory = {
  readonly status: WorkspaceUsersAvailability
  readonly users: readonly UserProfile[]
}
export type CollabHostApi = {
  getHostState: () => CollabHostState | null
  setHostState: (state: CollabHostStateInput) => void
  subscribeHostState: (listener: (state: CollabHostState | null) => void) => () => void
  setShareHandler: (handler: CollabShareHandler | null) => void
}
// Who supplies the current user: local setup, an outer host, or an auth proxy.
export type CurrentUserSource = 'dev' | 'external' | AuthProvider

// Earlier development builds generated a dev user automatically. Only this
// explicit profile key opts a tab into collaboration and workspace controls.
const PROFILE_KEY = 'moi:collab:dev-profile'
let currentUser: UserProfile | null = null
let installed = false
let shareHandler: CollabShareHandler | null = null
let currentUserSource: CurrentUserSource | null = null
const listeners = new Set<() => void>()
const workspaceListeners = new Map<string, Set<() => void>>()
const hostListeners = new Set<() => void>()
const EMPTY_USERS: readonly UserProfile[] = Object.freeze([])
const EMPTY_WORKSPACES = Object.freeze({})
const LOADING_HOST_DIRECTORY = Object.freeze({ status: 'loading' as const })
const UNAVAILABLE_DIRECTORY: WorkspaceDirectory = Object.freeze({
  status: 'unavailable',
  users: EMPTY_USERS
})
const LOADING_DIRECTORY: WorkspaceDirectory = Object.freeze({
  status: 'loading',
  users: EMPTY_USERS
})
let hostState: CollabHostState | null = null

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

function normalizeHostState(value: CollabHostStateInput): CollabHostState {
  if (!value || typeof value !== 'object') throw new Error('Invalid host state.')
  const current = value.currentUser === null ? null : normalizeUserProfile(value.currentUser)
  if (!value.workspaces || typeof value.workspaces !== 'object' || Array.isArray(value.workspaces))
    throw new Error('Host workspaces must be a record.')
  const entries = Object.entries(value.workspaces).map(([id, directory]) => {
    if (!id.trim() || !directory || typeof directory !== 'object')
      throw new Error('Invalid workspace directory.')
    if (directory.status === 'loading') return [id, LOADING_HOST_DIRECTORY] as const
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

export function getHostState(): CollabHostState | null {
  return hostState
}

export function getWorkspaceDirectory(workspaceId: string): WorkspaceDirectory {
  if (!hostState) return UNAVAILABLE_DIRECTORY
  const directory = Object.hasOwn(hostState.workspaces, workspaceId)
    ? hostState.workspaces[workspaceId]
    : undefined
  return directory?.status === 'ready' ? directory : LOADING_DIRECTORY
}

export function getWorkspaceUsers(workspaceId: string): readonly UserProfile[] | null {
  const directory = getWorkspaceDirectory(workspaceId)
  return directory.status === 'unavailable' ? null : directory.users
}

export function setHostState(next: CollabHostStateInput): void {
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

export function subscribeHostState(listener: (state: CollabHostState | null) => void): () => void {
  const unsubscribe = subscribeHostStateStore(() => listener(getHostState()))
  listener(getHostState())
  return unsubscribe
}

// Internal compatibility helpers. External hosts replace the complete state atomically.
export function setWorkspaceUsers(workspaceId: string, users: readonly UserProfile[] | null): void {
  setHostState({
    currentUser,
    workspaces: {
      ...hostState?.workspaces,
      [workspaceId]: users === null ? { status: 'loading' } : { status: 'ready', users }
    }
  })
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

export function subscribeWorkspaceUsers(
  workspaceId: string,
  listener: (users: readonly UserProfile[] | null) => void
): () => void {
  const unsubscribe = subscribeWorkspaceUsersStore(workspaceId, () =>
    listener(getWorkspaceUsers(workspaceId))
  )
  listener(getWorkspaceUsers(workspaceId))
  return unsubscribe
}

export function getCurrentUser(): UserProfile | null {
  return currentUser
}

export function setCurrentUser(next: UserProfile | null): void {
  setHostState({ currentUser: next, workspaces: hostState?.workspaces ?? EMPTY_WORKSPACES })
}

export function subscribeCurrentUserStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function subscribeCurrentUser(
  listener: (currentUser: UserProfile | null) => void
): () => void {
  listener(currentUser)
  return subscribeCurrentUserStore(() => listener(currentUser))
}

export function getCurrentUserSource(): CurrentUserSource | null {
  return currentUserSource
}

// An auth proxy takes precedence over local test users; an outer host takes
// precedence over the proxy. A configured proxy with no user signs this tab out.
export function setProxyUserState({ provider, profile }: ProxyUserState): void {
  if (currentUserSource === 'external') return
  if (provider === null) {
    if (currentUserSource === null || currentUserSource === 'dev') return
    currentUserSource = null
    currentUser = null
  } else {
    const normalized = profile === null ? null : normalizeUserProfile(profile)
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

function persistDevUser(): void {
  try {
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(currentUser))
  } catch {
    /* Private browsing. */
  }
}

export function setDevUser(next: UserProfile): void {
  // A provider may take over between rendering the dev form and handling input.
  if (currentUserSource !== null && currentUserSource !== 'dev') return
  const normalized = normalizeUserProfile(next)
  currentUserSource = 'dev'
  currentUser = normalized
  persistDevUser()
  listeners.forEach(listener => listener())
}

export async function shareWorkspace(workspaceId: string): Promise<'copied'> {
  const url = new URL(`/workspace/${encodeURIComponent(workspaceId)}`, location.origin).href
  if (shareHandler) {
    const shared = await shareHandler({ workspaceId, url })
    const target = new URL(shared.url)
    if (target.protocol !== 'https:' && target.protocol !== 'http:')
      throw new Error('The share handler returned an invalid URL.')
    await navigator.clipboard.writeText(target.href)
    return 'copied'
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}

// A host supplies one initial atomic snapshot before loading moi's modules.
export function installHostApi(): void {
  if (typeof window === 'undefined' || installed) return
  installed = true
  const host = window as Window & {
    moi?: {
      collab?: {
        getHostState?: () => CollabHostStateInput | null
      }
      [key: string]: unknown
    }
  }
  const previous = host.moi?.collab
  if (previous?.getHostState) {
    try {
      setHostState(previous.getHostState() ?? { currentUser: null, workspaces: {} })
    } catch {
      // An unavailable host remains authoritative; never restore a dev profile.
      setHostState({ currentUser: null, workspaces: {} })
    }
  } else if (currentUserSource === null) {
    try {
      const saved = sessionStorage.getItem(PROFILE_KEY)
      if (saved) {
        currentUser = normalizeUserProfile(JSON.parse(saved) as UserProfile)
        currentUserSource = 'dev'
      }
    } catch {
      /* Missing, invalid, or unavailable storage leaves the current user unset. */
    }
  }
  host.moi ??= {}
  const api: CollabHostApi = {
    getHostState,
    setHostState,
    subscribeHostState,
    setShareHandler(handler) {
      shareHandler = handler
    }
  }
  host.moi.collab = api
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('moi:collab-ready'))
  }
}
