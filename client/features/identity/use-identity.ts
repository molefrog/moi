import { useSyncExternalStore } from 'react'
import { subscribeIdentity, getIdentity } from './store'

export function useIdentity() {
  return useSyncExternalStore(subscribeIdentity, getIdentity, getIdentity)
}
