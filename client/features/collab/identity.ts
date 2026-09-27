import { isCollabIdentity } from '@/lib/collab/protocol'
import type { CollabIdentity } from '@/lib/collab/types'

export type CollabShareContext = { workspaceId: string; url: string }
export type CollabShareHandler = (context: CollabShareContext) => Promise<{ url: string }>
export type CollabHostDirectory =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly users: readonly CollabIdentity[] }
export type CollabHostState = {
  readonly identity: CollabIdentity | null
  readonly workspaces: Readonly<Record<string, CollabHostDirectory>>
}
export type WorkspaceDirectory = {
  readonly status: 'unavailable' | 'loading' | 'ready'
  readonly users: readonly CollabIdentity[]
}
export type CollabIdentityApi = {
  getHostState: () => CollabHostState | null
  setHostState: (state: CollabHostState) => void
  subscribeHostState: (listener: (state: CollabHostState | null) => void) => () => void
  setShareHandler: (handler: CollabShareHandler | null) => void
}

// Earlier development builds generated dev-identity automatically. Only this
// explicit profile key opts a tab into identity and workspace controls.
const PROFILE_KEY = 'moi:collab:dev-profile'
let identity: CollabIdentity | null = null
let installed = false
let shareHandler: CollabShareHandler | null = null
let identitySource: 'dev' | 'external' | null = null
const listeners = new Set<() => void>()
const workspaceListeners = new Map<string, Set<() => void>>()
const hostListeners = new Set<() => void>()
const EMPTY_USERS: readonly CollabIdentity[] = Object.freeze([])
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

export function normalizeIdentity(value: CollabIdentity): CollabIdentity {
  if (!value || typeof value.id !== 'string' || !value.id.trim())
    throw new Error('An identity needs an id.')
  if (value.name !== undefined && typeof value.name !== 'string')
    throw new Error('An identity name must be a string when provided.')
  const normalized: CollabIdentity = {
    id: value.id.trim(),
    ...(value.name !== undefined ? { name: value.name.trim() } : {}),
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#0f766e',
    ...(value.avatar !== undefined ? { avatar: value.avatar } : {}),
    ...(value.email !== undefined ? { email: value.email } : {})
  }
  if (!isCollabIdentity(normalized)) throw new Error('Invalid user profile.')
  return Object.freeze(normalized)
}

export function normalizeWorkspaceUsers(
  users: readonly CollabIdentity[]
): readonly CollabIdentity[] {
  if (!Array.isArray(users)) throw new Error('Workspace users must be an array.')
  const ids = new Set<string>()
  const snapshot = users.map(user => {
    const normalized = normalizeIdentity(user)
    if (ids.has(normalized.id)) throw new Error('Workspace users must have unique ids.')
    ids.add(normalized.id)
    return normalized
  })
  return Object.freeze(snapshot)
}

function normalizeHostState(value: CollabHostState): CollabHostState {
  if (!value || typeof value !== 'object') throw new Error('Invalid host state.')
  const current = value.identity === null ? null : normalizeIdentity(value.identity)
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
    identity: current,
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

export function getWorkspaceUsers(workspaceId: string): readonly CollabIdentity[] | null {
  const directory = getWorkspaceDirectory(workspaceId)
  return directory.status === 'unavailable' ? null : directory.users
}

export function setHostState(next: CollabHostState): void {
  const normalized = normalizeHostState(next)
  const previousDirectories = new Map(
    [...workspaceListeners.keys()].map(id => [id, getWorkspaceDirectory(id)])
  )
  // Publish every field before notifying any observer, including transport listeners.
  hostState = normalized
  identitySource = 'external'
  identity = normalized.identity
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
export function setWorkspaceUsers(
  workspaceId: string,
  users: readonly CollabIdentity[] | null
): void {
  setHostState({
    identity,
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
  listener: (users: readonly CollabIdentity[] | null) => void
): () => void {
  const unsubscribe = subscribeWorkspaceUsersStore(workspaceId, () =>
    listener(getWorkspaceUsers(workspaceId))
  )
  listener(getWorkspaceUsers(workspaceId))
  return unsubscribe
}

export function getIdentity(): CollabIdentity | null {
  return identity
}

export function setIdentity(next: CollabIdentity | null): void {
  setHostState({ identity: next, workspaces: hostState?.workspaces ?? EMPTY_WORKSPACES })
}

export function subscribeIdentityStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function subscribeIdentity(listener: (identity: CollabIdentity | null) => void): () => void {
  listener(identity)
  return subscribeIdentityStore(() => listener(identity))
}

export function getIdentitySource(): 'dev' | 'external' | null {
  return identitySource
}

function persistDevIdentity(): void {
  try {
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(identity))
  } catch {
    /* Private browsing. */
  }
}

export function setDevIdentity(next: CollabIdentity): void {
  // A provider may take over between rendering the dev form and handling input.
  if (identitySource === 'external') return
  const normalized = normalizeIdentity(next)
  identitySource = 'dev'
  identity = normalized
  persistDevIdentity()
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
export function installIdentityApi(): void {
  if (typeof window === 'undefined' || installed) return
  installed = true
  const host = window as unknown as {
    moi?: { collab?: Partial<CollabIdentityApi>; [key: string]: unknown }
  }
  const previous = host.moi?.collab
  if (previous?.getHostState) {
    try {
      setHostState(previous.getHostState() ?? { identity: null, workspaces: {} })
    } catch {
      // An unavailable host remains authoritative; never restore a dev profile.
      setHostState({ identity: null, workspaces: {} })
    }
  } else if (identitySource !== 'external') {
    try {
      const saved = sessionStorage.getItem(PROFILE_KEY)
      if (saved) {
        identity = normalizeIdentity(JSON.parse(saved) as CollabIdentity)
        identitySource = 'dev'
      }
    } catch {
      /* Missing, invalid, or unavailable storage leaves identity unset. */
    }
  }
  host.moi ??= {}
  host.moi.collab = {
    getHostState,
    setHostState,
    subscribeHostState,
    setShareHandler(handler) {
      shareHandler = handler
    }
  }
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('moi:collab-ready'))
  }
}
