import type { CollabIdentity, CollabParticipant } from '@/lib/collab/types'

// active: a visible tab. away: connected, every tab hidden. offline: not here.
export type PersonStatus = 'active' | 'away' | 'offline'
export type ResolvedPerson = { id: string; identity: CollabIdentity | null; status: PersonStatus }
export type PeopleSource = {
  participants: CollabParticipant[]
  people: Readonly<Record<string, CollabIdentity>>
}

// A person is referred to by id everywhere. Live connections are freshest, then the directory, then the local profile
// before it has reached the server.
export function resolvePerson(
  source: PeopleSource,
  self: CollabIdentity | null,
  id: string
): ResolvedPerson {
  const connections = source.participants.filter(participant => participant.identity.id === id)
  const status: PersonStatus = connections.some(connection => connection.location !== null)
    ? 'active'
    : connections.length
      ? 'away'
      : 'offline'
  const identity = connections[0]?.identity ?? source.people[id] ?? (self?.id === id ? self : null)
  return { id, identity, status }
}

// One row per person for the people list: connections collapse by identity
// id, the current user comes first, and `pages` lists the tabs their visible
// browser tabs are on. No pages means every tab of theirs is hidden: away.
export type PresentPerson = { identity: CollabIdentity; self: boolean; pages: string[] }

export type SelfConnection = {
  identity: CollabIdentity | null
  connectionId: string | null
  page: string | null
}

export function groupPeople(
  participants: CollabParticipant[],
  self: SelfConnection
): PresentPerson[] {
  const people = new Map<string, PresentPerson>()
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
