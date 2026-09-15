import type { CollabIdentity } from '@/lib/collab/types'

export type CollabShareContext = { workspaceId: string; url: string }
export type CollabShareHandler = (context: CollabShareContext) => Promise<{ url: string }>
export type CollabIdentityApi = {
  getIdentity: () => CollabIdentity | null
  setIdentity: (identity: CollabIdentity | null) => void
  subscribeIdentity: (listener: (identity: CollabIdentity | null) => void) => () => void
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

function normalizeIdentity(value: CollabIdentity): CollabIdentity {
  if (!value || !value.id?.trim() || !value.name?.trim()) {
    throw new Error('An identity needs an id and name.')
  }
  return {
    id: value.id.trim(),
    name: value.name.trim(),
    color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#0f766e',
    ...(value.avatar ? { avatar: value.avatar } : {})
  }
}

export function getIdentity(): CollabIdentity | null {
  return identity
}

export function setIdentity(next: CollabIdentity | null): void {
  identitySource = next === null ? null : 'external'
  identity = next === null ? null : normalizeIdentity(next)
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
  identitySource = 'dev'
  identity = normalizeIdentity(next)
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
  if (previous?.getIdentity) {
    try {
      const initial = previous.getIdentity()
      identity = initial === null ? null : normalizeIdentity(initial)
      identitySource = 'external'
    } catch {
      /* Use the local profile. */
    }
  } else {
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
    setShareHandler(handler) {
      shareHandler = handler
    }
  }
}
