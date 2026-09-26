import type { CollabJsonValue, CollabPresenceRegistration } from '@/lib/collab/types'

import type { CollabBackend } from './backend'

// A mounted control owns a registration only while it has something to show.
// Public custom publishers omit the predicate: false and null are valid values.
export function createPresencePublisher<T extends CollabJsonValue>(
  backend: Pick<CollabBackend, 'setPresence' | 'deletePresence'>,
  registration: Omit<CollabPresenceRegistration, 'value'>,
  isPresent: (value: T) => boolean = () => true
) {
  let registered = false
  const clear = () => {
    if (!registered) return
    registered = false
    backend.deletePresence(registration.registrationId)
  }
  return {
    publish(value: T, active: boolean) {
      if (!active || !isPresent(value)) {
        clear()
        return
      }
      registered = true
      backend.setPresence({ ...registration, value })
    },
    clear
  }
}
