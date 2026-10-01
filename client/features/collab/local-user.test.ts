import { expect, test } from 'bun:test'

import { localUserProfile } from './local-user'

test.each(['', ' \t '])('local users omit blank names: %j', name => {
  expect(localUserProfile('local-user', { name, color: 'emerald' })).toEqual({
    id: 'local-user',
    color: 'emerald'
  })
})

test('local users trim supplied names', () => {
  expect(localUserProfile('local-user', { name: ' Ada ', color: 'emerald' }).name).toBe('Ada')
})
