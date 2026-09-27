import { expect, test } from 'bun:test'

import { personaIdentity } from './dev-persona'

test('dev identities allow empty names without filling the profile with a display fallback', () => {
  expect(personaIdentity('dev-person', { name: '', color: '#0f766e' })).toEqual({
    id: 'dev-person',
    name: '',
    color: '#0f766e'
  })
})
