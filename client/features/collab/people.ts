import type { CollabIdentity, CollabParticipant } from '@/lib/collab/types'

// One row per person for the people list: connections collapse by identity
// id, the current user comes first, and `pages` lists the tabs their visible
// browser tabs are on. No pages means every tab of theirs is hidden: away.
export type Person = { identity: CollabIdentity; self: boolean; pages: string[] }

export type SelfConnection = {
  identity: CollabIdentity | null
  connectionId: string | null
  page: string | null
}

export function groupPeople(participants: CollabParticipant[], self: SelfConnection): Person[] {
  const people = new Map<string, Person>()
  if (self.identity) {
    people.set(self.identity.id, {
      identity: self.identity,
      self: true,
      pages: self.page ? [self.page] : []
    })
  }
  for (const participant of participants) {
    if (participant.connectionId === self.connectionId) continue
    const id = participant.identity.id
    const person = people.get(id) ?? { identity: participant.identity, self: false, pages: [] }
    const page = participant.location?.page
    if (page && !person.pages.includes(page)) person.pages.push(page)
    people.set(id, person)
  }
  return [...people.values()]
}
