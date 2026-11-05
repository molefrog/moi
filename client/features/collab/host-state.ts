import { isUserProfile } from '@/lib/collab/protocol'
import { colorForId, isUserColor } from '@/lib/collab/colors'
import type { AuthProvider, ProxyUserState, UserProfile } from '@/lib/collab/types'
import { createLocalUser } from './local-user'

export type UserProfileInput = Omit<UserProfile, 'color'> & { color?: UserProfile['color'] }
// Who supplies the current user: local setup, an outer host, or an auth proxy.
export type CurrentUserSource = 'local' | 'external' | AuthProvider

const PROFILE_KEY = 'moi:local-profile'
let currentUser: UserProfile | undefined
let currentUserSource: CurrentUserSource | undefined
const listeners = new Set<() => void>()

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

// Cloud identity is independent of every workspace's member list.
export function setExternalUser(profile: UserProfileInput | undefined): void {
  const next = profile ? normalizeUserProfile(profile) : undefined
  const changed = currentUserSource !== 'external' || !sameProfile(currentUser, next)
  currentUserSource = 'external'
  if (changed) currentUser = next
  if (changed) listeners.forEach(listener => listener())
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
    localStorage.setItem(PROFILE_KEY, JSON.stringify(currentUser))
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
export function initializeLocalUser(local: boolean, proxyUser: ProxyUserState | undefined): void {
  if (!local || !proxyUser || proxyUser.provider !== undefined || currentUserSource !== undefined)
    return
  try {
    const saved = localStorage.getItem(PROFILE_KEY)
    if (saved) {
      setLocalUser(JSON.parse(saved) as UserProfile)
      return
    }
  } catch {
    // Invalid or unavailable storage starts a fresh local profile.
  }
  setLocalUser(createLocalUser())
}

// Storage events update this tab without writing back and triggering another event.
export function receiveLocalProfile(event: Pick<StorageEvent, 'key' | 'newValue'>): void {
  if (event.key !== PROFILE_KEY || !event.newValue || currentUserSource !== 'local') return
  try {
    const profile = normalizeUserProfile(JSON.parse(event.newValue) as UserProfile)
    if (sameProfile(profile, currentUser)) return
    currentUser = profile
    listeners.forEach(listener => listener())
  } catch {
    // Ignore corrupt values from other tabs.
  }
}

export function subscribeLocalProfileStorage(): () => void {
  window.addEventListener('storage', receiveLocalProfile)
  return () => window.removeEventListener('storage', receiveLocalProfile)
}
