import { afterEach, expect, spyOn, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { identityQuery, updateCloudProfile } from './api'
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
test('profile uses same-origin cloud route and can clear avatar', async () => {
  const mock = fetchResponse(Response.json({ success: true }))
  await updateCloudProfile({ name: 'New name', avatar: null })
  expect(mock.mock.calls[0]?.[0]).toBe('/cloud/api/auth/profile')
  expect(mock.mock.calls[0]?.[1]).toMatchObject({
    credentials: 'same-origin',
    body: JSON.stringify({ name: 'New name', avatar: null })
  })
})
