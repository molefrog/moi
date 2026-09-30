import type { JsonValue } from 'moi'
import type { PresenceRegistration } from '@/lib/collab/types'

import type { CollabEngineApi } from './engine'

// A mounted control owns a registration only while it has something to show.
// Public custom publishers omit the predicate: false and null are valid values.
export function createPresencePublisher<T extends JsonValue>(
  engine: Pick<CollabEngineApi, 'setPresence' | 'deletePresence'>,
  registration: Omit<PresenceRegistration, 'value'>,
  isPresent: (value: T) => boolean = () => true
) {
  let registered = false
  const clear = () => {
    if (!registered) return
    registered = false
    engine.deletePresence(registration.registrationId)
  }
  return {
    publish(value: T, active: boolean) {
      if (!active || !isPresent(value)) {
        clear()
        return
      }
      registered = true
      engine.setPresence({ ...registration, value })
    },
    clear
  }
}
