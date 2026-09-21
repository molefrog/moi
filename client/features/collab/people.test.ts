import { expect, test } from 'bun:test'

import type { CollabParticipant } from '@/lib/collab/types'

import { groupPeople, resolvePerson } from './people'

const ada = { id: 'ada', name: 'Ada', color: '#f59e0b' }
const ken = { id: 'ken', name: 'Ken', color: '#3b82f6' }

function connection(
  connectionId: string,
  identity: typeof ada,
  page: string | null
): CollabParticipant {
  return { connectionId, identity, location: page ? { page } : null, presence: [] }
}

test('groups connections by person, puts the current user first, and merges tabs', () => {
  const people = groupPeople(
    [
      connection('c2', ken, 'view:board'),
      connection('c1', ada, 'overview'),
      connection('c3', ken, 'agent'),
      connection('c4', ada, 'scratchpad')
    ],
    { identity: ada, connectionId: 'c1', page: 'overview' }
  )
  expect(people.map(person => person.identity.name)).toEqual(['Ada', 'Ken'])
  expect(people[0]).toMatchObject({ self: true, pages: ['overview', 'scratchpad'] })
  expect(people[1]).toMatchObject({ self: false, pages: ['view:board', 'agent'] })
})

test('a person whose tabs are all hidden has no pages, and the local user appears before connecting', () => {
  const people = groupPeople([connection('c2', ken, null)], {
    identity: ada,
    connectionId: null,
    page: null
  })
  expect(people).toEqual([
    { identity: ada, self: true, pages: [] },
    { identity: ken, self: false, pages: [] }
  ])
})
test('a person resolves from live connections, then the directory, then the local profile', () => {
  const stale = { ...ken, name: 'Old Ken' }
  const source = {
    participants: [connection('c1', ken, 'view:board'), connection('c2', ada, null)],
    people: { ken: stale, fig: { id: 'fig', name: 'Fig', color: '#10b981' } }
  }
  expect(resolvePerson(source, null, 'ken')).toEqual({ id: 'ken', identity: ken, status: 'active' })
  expect(resolvePerson(source, null, 'ada').status).toBe('away')
  expect(resolvePerson(source, null, 'fig')).toEqual({
    id: 'fig',
    identity: source.people.fig,
    status: 'offline'
  })
  expect(resolvePerson(source, null, 'nobody')).toEqual({
    id: 'nobody',
    identity: null,
    status: 'offline'
  })
  const me = { id: 'me', name: 'Me', color: '#8b5cf6' }
  expect(resolvePerson(source, me, 'me').identity).toEqual(me)
  // Once Ken disconnects, the directory's copy of him answers.
  expect(resolvePerson({ ...source, participants: [] }, null, 'ken')).toEqual({
    id: 'ken',
    identity: stale,
    status: 'offline'
  })
})
