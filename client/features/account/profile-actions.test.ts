import { afterEach, expect, test } from 'bun:test'
import { queryClient } from '@/client/api/query-client'
import { getIdentity, setIdentity } from '../identity/store'
import { getCurrentUser } from '../collab/host-state'
import type { Identity } from '../identity/types'
import { saveCloudProfile } from './profile-actions'

const me = {
  id: 'alex',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false
} as const

afterEach(() => {
  setIdentity(null)
  queryClient.clear()
})

test('a profile response preserves newer pushed fields and updates the derived collaboration profile', async () => {
  setIdentity(me)
  const pending = Promise.withResolvers<Identity>()
  const save = saveCloudProfile('name', () => pending.promise)
  setIdentity({ ...me, avatar: 'https://example.com/new-avatar.png' })
  pending.resolve({ ...me, name: 'Renamed', avatar: 'https://example.com/old-avatar.png' })
  await save
  expect(getIdentity()).toMatchObject({
    name: 'Renamed',
    avatar: 'https://example.com/new-avatar.png'
  })
  expect(getCurrentUser()).toMatchObject({
    name: 'Renamed',
    avatar: 'https://example.com/new-avatar.png'
  })
})

test('a newer pushed name wins over a delayed name save', async () => {
  setIdentity(me)
  const pending = Promise.withResolvers<Identity>()
  const save = saveCloudProfile('name', () => pending.promise)
  setIdentity({ ...me, name: 'Newer name' })
  pending.resolve({ ...me, name: 'Older name' })
  await save
  expect(getIdentity()?.name).toBe('Newer name')
  expect(getCurrentUser()?.name).toBe('Newer name')
})

test('switching away and back rejects a save from the previous account session', async () => {
  setIdentity(me)
  const pending = Promise.withResolvers<Identity>()
  const save = saveCloudProfile('name', () => pending.promise)
  setIdentity({ ...me, id: 'other' })
  setIdentity(me)
  pending.resolve({ ...me, name: 'Old session' })
  await expect(save).rejects.toThrow('Your account changed')
  expect(getIdentity()).toEqual(me)
})
