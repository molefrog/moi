import { expect, test } from 'bun:test'

import type { CollabParticipant } from '@/lib/collab/types'

import { groupPeople } from './people'

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
