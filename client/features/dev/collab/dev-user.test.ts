import { expect, test } from 'bun:test'

import { devUserProfile } from './dev-user'

test.each(['', ' \t '])('test users omit blank names: %j', name => {
  expect(devUserProfile('dev-user', { name, color: 'emerald' })).toEqual({
    id: 'dev-user',
    color: 'emerald'
  })
})

test('test users trim supplied names', () => {
  expect(devUserProfile('dev-user', { name: ' Ada ', color: 'emerald' }).name).toBe('Ada')
})
