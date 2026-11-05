import { setExternalUser } from '@/client/features/collab/host-state'
import { queryClient } from '@/client/api/query-client'
import { collabIdentityId, identityKey, parseIdentity } from './types'
import type { Identity } from './types'

let current: Identity | null | undefined
let generation = 0
let version = 0
const listeners = new Set<() => void>()
export const getIdentity = () => current
export const getIdentityVersion = () => version
export const getIdentityGeneration = () => generation
export function subscribeIdentity(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function setIdentity(value: Identity | null): void {
  const next = value === null ? null : parseIdentity(value)
  const changedAccount = (current && identityKey(current)) !== (next && identityKey(next))
  if (changedAccount) {
    generation++
    void queryClient.cancelQueries({ queryKey: ['workspace-members'] })
    queryClient.removeQueries({ queryKey: ['workspace-members'] })
  }
  version++
  current = next
  setExternalUser(
    !next || (next.type === 'user' && next.isAnonymous)
      ? undefined
      : {
          id: collabIdentityId(next),
          name: next.name || undefined,
          avatar: next.avatar,
          email: next.type === 'user' ? next.email : undefined
        }
  )
  listeners.forEach(listener => listener())
}
