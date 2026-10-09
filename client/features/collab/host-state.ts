import { isUserProfile } from '@/lib/collab/protocol'
import { colorForId, isUserColor } from '@/lib/collab/colors'
import type { AuthProvider, ProxyUserState, UserProfile } from '@/lib/collab/types'
import { createLocalUser } from './local-user'

export type UserProfileInput = Omit<UserProfile, 'color'> & { color?: UserProfile['color'] }
// What an outer host publishes: the viewer's id and everyone moi may show.
// `me` must be listed in `users`; leave it out when nobody is signed in.
export type HostUsers = {
  me?: string | null
  users: readonly UserProfileInput[]
}
// `window.moi.collab`. An outer host calls it from a module script placed after
// moi's bundle, once at startup and again whenever a user or the viewer changes.
// A classic inline script runs before the bundle and finds nothing here.
//
//   window.moi.collab.publishUsers({ me: 'alex', users: [{ id: 'alex', name: 'Alex' }] })
export type HostApi = { publishUsers: (next: HostUsers) => void }
// Who supplies the current user: local setup, an outer host, or an auth proxy.
export type CurrentUserSource = 'local' | 'external' | AuthProvider

// Keep the existing key so local profiles survive the startup change.
const PROFILE_KEY = 'moi:collab:dev-profile'
const NO_USERS: readonly UserProfile[] = Object.freeze([])
let currentUser: UserProfile | undefined
let currentUserSource: CurrentUserSource | undefined
// One list for the whole app. Undefined until a host publishes; from then on it
// is authoritative, including when it is empty.
let directory: readonly UserProfile[] | undefined
let installed = false
const listeners = new Set<() => void>()
const directoryListeners = new Set<() => void>()

// Normalized profiles list their fields in one order, so text equality is exact.
function sameProfile(a: UserProfile | undefined, b: UserProfile | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

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

export function normalizeUsers(users: readonly UserProfileInput[]): readonly UserProfile[] {
  if (!Array.isArray(users)) throw new Error('Users must be an array.')
  const ids = new Set<string>()
  const snapshot = users.map(user => {
    const normalized = normalizeUserProfile(user)
    if (ids.has(normalized.id)) throw new Error('Users must have unique ids.')
    ids.add(normalized.id)
    return normalized
  })
  return Object.freeze(snapshot)
}

// Replaces the viewer and the whole directory in one step. The host sends the
// full list every time, so a removal is simply an id that is no longer there.
// Invalid input throws and publishes nothing.
export function publishUsers(next: HostUsers): void {
  if (!next || typeof next !== 'object') throw new Error('Users must be published as an object.')
  const users = normalizeUsers(next.users)
  let user: UserProfile | undefined
  if (next.me !== undefined && next.me !== null) {
    if (typeof next.me !== 'string') throw new Error('The current user id must be a string.')
    const id = next.me.trim()
    user = users.find(candidate => candidate.id === id)
    if (!user) throw new Error('The current user must be listed in users.')
  }
  // An unchanged viewer keeps its profile object and stays quiet: every notice
  // makes each open workspace resend that profile to its room.
  const changed = currentUserSource !== 'external' || !sameProfile(currentUser, user)
  // Publish every field before notifying any observer, including transport listeners.
  currentUserSource = 'external'
  if (changed) currentUser = user
  // A signed-out viewer sees no one, whatever the host still lists.
  directory = user ? users : NO_USERS
  if (changed) listeners.forEach(listener => listener())
  directoryListeners.forEach(listener => listener())
}

export function getDirectory(): readonly UserProfile[] | undefined {
  return directory
}

export function subscribeDirectoryStore(listener: () => void): () => void {
  directoryListeners.add(listener)
  return () => {
    directoryListeners.delete(listener)
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
    if (currentUserSource === provider && sameProfile(currentUser, normalized)) return
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
// A host that has already published keeps the viewer it chose, signed in or not.
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

// Runs while moi's bundle evaluates, so a host script placed after the bundle
// finds `publishUsers` at once and can publish before the app mounts.
export function installHostApi(): void {
  if (typeof window === 'undefined' || installed) return
  installed = true
  const host = window as Window & { moi?: { collab?: HostApi; [key: string]: unknown } }
  host.moi ??= {}
  const api: HostApi = { publishUsers }
  host.moi.collab = api
}
