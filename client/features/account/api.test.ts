import { afterEach, expect, spyOn, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { identityQuery, updateCloudProfile, uploadCloudAvatar, removeCloudAvatar } from './api'
import { getIdentity, setIdentity } from '../identity/store'
import { parseIdentity } from '../identity/types'
let cleanup = () => {}
afterEach(() => {
  cleanup()
  setIdentity(null)
})
const human = {
  id: 'alex',
  type: 'user',
  name: 'Alex',
  email: 'alex@example.com',
  isAnonymous: false
} as const
function fetchResponse(response: Response | Promise<Response>) {
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => response, { preconnect: fetch.preconnect })
  )
  cleanup = () => mock.mockRestore()
  return mock
}
test('identity endpoint supports human and agent identity shapes', async () => {
  expect(parseIdentity(human)).toEqual(human)
  expect(
    parseIdentity({ id: 'bot', type: 'agent', name: 'Helper', avatar: 'https://example.com/a.png' })
      .type
  ).toBe('agent')
  expect(() => parseIdentity({ ...human, avatar: 'javascript:alert(1)' })).toThrow()
  expect(() => parseIdentity({ ...human, type: 'robot' })).toThrow()
})
test('401 clears identity while a temporary API failure does not sign out', async () => {
  setIdentity(human)
  fetchResponse(Response.json({ error: 'No session' }, { status: 401 }))
  const client = new QueryClient()
  expect(await client.fetchQuery(identityQuery)).toBeNull()
  expect(getIdentity()).toBeNull()
  client.clear()
})
test('an old identity response cannot overwrite a newer host announcement', async () => {
  const pending = Promise.withResolvers<Response>()
  fetchResponse(pending.promise)
  const client = new QueryClient()
  const request = client.fetchQuery(identityQuery)
  setIdentity({ ...human, id: 'new', name: 'New account' })
  pending.resolve(Response.json(human))
  await request
  expect(getIdentity()?.id).toBe('new')
  client.clear()
})
test('profile updates use PATCH me and return the full profile', async () => {
  const saved = { ...human, name: 'New name', avatar: 'https://example.com/avatar.png' }
  const mock = fetchResponse(Response.json(saved))
  expect(await updateCloudProfile({ name: 'New name' })).toEqual(saved)
  expect(mock.mock.calls[0]?.[0]).toBe('/cloud/api/me')
  expect(mock.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'same-origin',
    method: 'PATCH',
    body: JSON.stringify({ name: 'New name' })
  })
})

test('avatar upload sends a file to the dedicated route and returns the full profile', async () => {
  const saved = { ...human, avatar: 'https://example.com/avatar.png' }
  const mock = fetchResponse(Response.json(saved))
  const file = new File(['test'], 'test.png', { type: 'image/png' })
  expect(await uploadCloudAvatar(file)).toEqual(saved)
  expect(mock.mock.calls[0]?.[0]).toBe('/cloud/api/me/avatar')
  const init = mock.mock.calls[0]?.[1]
  expect(init).toMatchObject({ method: 'PUT', credentials: 'same-origin' })
  expect((init!.body as FormData).get('file')).toBeInstanceOf(File)
})

test('avatar removal uses DELETE and returns the profile without an avatar', async () => {
  const mock = fetchResponse(Response.json(human))
  expect(await removeCloudAvatar()).toEqual(human)
  expect(mock.mock.calls[0]?.[0]).toBe('/cloud/api/me/avatar')
  expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE', credentials: 'same-origin' })
})
