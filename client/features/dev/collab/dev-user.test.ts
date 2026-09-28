import { expect, test } from 'bun:test'

import { devUserProfile } from './dev-user'

test('test users allow empty names without filling the profile with a display fallback', () => {
  expect(devUserProfile('dev-user', { name: '', color: '#0f766e' })).toEqual({
    id: 'dev-user',
    name: '',
    color: '#0f766e'
  })
})
