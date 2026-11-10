import { queryClient } from '@/client/api/query-client'
import { memberKeys } from '../collab/members/keys'
import { identityKey, parseIdentity } from './types'
import type { Identity } from './types'

let current: Identity | null | undefined
// Changes only when the account changes; guards requests from a previous account.
let accountGeneration = 0
// Changes on every identity write; guards against older profile responses.
let identityRevision = 0
const listeners = new Set<() => void>()
export const getIdentity = () => current
export const getIdentityRevision = () => identityRevision
export const getAccountGeneration = () => accountGeneration
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
    accountGeneration++
    void queryClient.cancelQueries({ queryKey: memberKeys.all })
    queryClient.removeQueries({ queryKey: memberKeys.all })
  }
  identityRevision++
  current = next
  listeners.forEach(listener => listener())
}
