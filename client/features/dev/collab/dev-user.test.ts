import { expect, test } from 'bun:test'

import { devUserProfile } from './dev-user'

test('test users allow empty names without filling the profile with a display fallback', () => {
  expect(devUserProfile('dev-user', { name: '', color: 'emerald' })).toEqual({
    id: 'dev-user',
    name: '',
    color: 'emerald'
  })
})
