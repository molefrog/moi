import { isCollabIdentity } from '@/lib/collab/protocol'
import type { CollabIdentity } from '@/lib/collab/types'

export type CollabShareContext = { workspaceId: string; url: string }
export type CollabShareHandler = (context: CollabShareContext) => Promise<{ url: string }>
export type CollabIdentityApi = {
  getIdentity: () => CollabIdentity | null
  setIdentity: (identity: CollabIdentity | null) => void
  subscribeIdentity: (listener: (identity: CollabIdentity | null) => void) => () => void
  setShareHandler: (handler: CollabShareHandler | null) => void
  getWorkspaceUsers: (workspaceId: string) => readonly CollabIdentity[] | null
  setWorkspaceUsers: (workspaceId: string, users: readonly CollabIdentity[] | null) => void
  subscribeWorkspaceUsers: (
    workspaceId: string,
    listener: (users: readonly CollabIdentity[] | null) => void
  ) => () => void
}

// Earlier development builds generated dev-identity automatically. Only this
// explicit profile key opts a tab into identity and workspace controls.
const PROFILE_KEY = 'moi:collab:dev-profile'
let identity: CollabIdentity | null = null
let installed = false
let shareHandler: CollabShareHandler | null = null
let identitySource: 'dev' | 'external' | null = null
const listeners = new Set<() => void>()
const workspaceUsers = new Map<string, readonly CollabIdentity[] | null>()
const workspaceListeners = new Map<string, Set<() => void>>()
let initialWorkspaceUsers: CollabIdentityApi['getWorkspaceUsers'] | undefined

export function normalizeIdentity(value: CollabIdentity): CollabIdentity {
  if (
    !value ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !value.id.trim() ||
    !value.name.trim()
  ) {
    throw new Error('An identity needs an id and name.')
  }
  const normalized: CollabIdentity = {
    id: value.id.trim(),
    name: value.name.trim(),
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

// A null snapshot releases the override. An empty snapshot is authoritative.
// Cache the preload getter once per workspace so React reads a stable snapshot.
export function getWorkspaceUsers(workspaceId: string): readonly CollabIdentity[] | null {
  if (!workspaceUsers.has(workspaceId)) {
    let snapshot: readonly CollabIdentity[] | null = null
    if (initialWorkspaceUsers) {
      try {
        const initial = initialWorkspaceUsers(workspaceId)
        snapshot = initial === null ? null : normalizeWorkspaceUsers(initial)
      } catch {
        // A configured but unavailable directory must not expose fallback profiles.
        snapshot = Object.freeze([])
      }
    }
    workspaceUsers.set(workspaceId, snapshot)
  }
  return workspaceUsers.get(workspaceId) ?? null
}

export function setWorkspaceUsers(
  workspaceId: string,
  users: readonly CollabIdentity[] | null
): void {
  const snapshot = users === null ? null : normalizeWorkspaceUsers(users)
  workspaceUsers.set(workspaceId, snapshot)
  workspaceListeners.get(workspaceId)?.forEach(listener => listener())
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
  const normalized = next === null ? null : normalizeIdentity(next)
  // Signing out still leaves the outer provider in charge of identity.
  identitySource = 'external'
  identity = normalized
  listeners.forEach(listener => listener())
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

// Installed only when collab is loaded. An outer identity script can supply an
// initial getter before loading; afterward it uses this stable subscription API.
export function installIdentityApi(): void {
  if (typeof window === 'undefined' || installed) return
  installed = true
  const host = window as unknown as {
    moi?: { collab?: Partial<CollabIdentityApi>; [key: string]: unknown }
  }
  const previous = host.moi?.collab
  initialWorkspaceUsers = previous?.getWorkspaceUsers?.bind(previous)
  if (previous?.getIdentity) {
    identitySource = 'external'
    identity = null
    try {
      const initial = previous.getIdentity()
      identity = initial === null ? null : normalizeIdentity(initial)
    } catch {
      /* The provider still owns identity while unavailable or signed out. */
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
    getIdentity,
    setIdentity,
    subscribeIdentity,
    getWorkspaceUsers,
    setWorkspaceUsers,
    subscribeWorkspaceUsers,
    setShareHandler(handler) {
      shareHandler = handler
    }
  }
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('moi:collab-ready'))
  }
}
